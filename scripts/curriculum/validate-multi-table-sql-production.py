#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sqlite3
import sys
from typing import Any

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
DRAFT = ROOT / ".curriculum-drafts/sql"
SUBJECT = "sql--multi-table-sql--draft"
SUBJECT_DIR = DRAFT / "subjects" / SUBJECT
MESSAGE_DIR = DRAFT / "messages/en/subjects" / SUBJECT


def fail(message: str) -> None:
    raise AssertionError(message)


def load(path: pathlib.Path) -> Any:
    if not path.exists():
        fail(f"Missing required file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def topic_bundle(module: int, topic: str) -> dict[str, Any]:
    return load(SUBJECT_DIR / "modules" / f"module{module}" / "topics" / topic / "topic.bundle.json")


def exercise(bundle: dict[str, Any], exercise_id: str) -> dict[str, Any]:
    for item in bundle["exercises"]:
        if item["id"] == exercise_id:
            return item
    fail(f"Missing exercise {exercise_id} in {bundle.get('topicId')}")


# Every JSON artifact must remain parseable.
json_count = 0
for path in DRAFT.rglob("*.json"):
    load(path)
    json_count += 1

# Chen is not taught in this course; ERD remains enabled.
for path in SUBJECT_DIR.rglob("*.json"):
    text = path.read_text(encoding="utf-8")
    if '"showChen": true' in text:
        fail(f"Chen is still enabled: {path}")

# Compiler repair diagnostics must not leak into learner-facing content.
for path in MESSAGE_DIR.rglob("*.json"):
    text = path.read_text(encoding="utf-8")
    if "This support text was repaired because" in text:
        fail(f"Compiler repair diagnostic remains in learner content: {path}")

# Opening relationship topic is conceptual-only.
reading = topic_bundle(0, "reading-keys-and-relationships")
if any(item["kind"] == "code_input" for item in reading["exercises"]):
    fail("Reading Keys and Relationships still contains code_input exercises")
if len(reading["exercises"]) != 6:
    fail(f"Reading Keys and Relationships should contain 6 conceptual checks, found {len(reading['exercises'])}")

# Module 0 qualification/alias Try Its must stay at two tables.
for topic in ("qualifying-columns-across-tables", "table-aliases-for-join-queries"):
    bundle = topic_bundle(0, topic)
    for item in bundle["exercises"]:
        if item["kind"] != "code_input":
            continue
        sql = item["recipe"]["solutionCode"].upper()
        joins = sql.count(" JOIN ")
        if joins != 1:
            fail(f"{topic}/{item['id']} should use exactly one JOIN, found {joins}")

# ON versus WHERE must compare the same right-side condition.
filtering = topic_bundle(2, "filtering-left-joins-with-on-and-where")
on_sql = exercise(filtering, "try-filtering-left-joins-with-on-and-where-sketch0")["recipe"]["solutionCode"]
where_sql = exercise(filtering, "try-filtering-left-joins-with-on-and-where-sketch1")["recipe"]["solutionCode"]
if "AND c.title LIKE '%History%'" not in on_sql:
    fail("ON-filter Try It does not place the History condition inside ON")
if "WHERE c.title LIKE '%History%'" not in where_sql:
    fail("WHERE-filter Try It does not move the same History condition to WHERE")

# Multi-choice must have genuinely plural correct answers.
for path in SUBJECT_DIR.rglob("topic.bundle.json"):
    bundle = load(path)
    for item in bundle["exercises"]:
        if item["kind"] == "multi_choice" and len(item["expected"].get("optionIds", [])) < 2:
            fail(f"One-answer multi_choice remains: {path} / {item['id']}")

# Result-grain language should describe a row, not a cardinality label.
grain = topic_bundle(1, "one-to-many-and-many-to-many-results")
grain_item = exercise(grain, "fill-blank-choice-2")
if grain_item["expected"].get("value") != "one course":
    fail("Result-grain exercise still uses an inaccurate relationship label")

# Final capstone uses a distinct student grain and correct metrics.
capstone = topic_bundle(3, "final-school-program-participation-report")
if capstone.get("minutes") != 100:
    fail("Capstone duration is not synchronized to 100 minutes")
capstone_solutions: list[str] = []
for item in capstone["exercises"]:
    sql = item["recipe"]["solutionCode"]
    capstone_solutions.append(sql)
    if "FROM students AS s" not in sql:
        fail(f"Capstone step {item['id']} does not start from students")
    if "LEFT JOIN enrollments AS e" not in sql:
        fail(f"Capstone step {item['id']} does not preserve students through enrollments")

for sql in capstone_solutions[1:]:
    if "COUNT(DISTINCT c.id) AS course_count" not in sql:
        fail("A capstone count step does not count distinct courses")
if "COUNT(DISTINCT d.id) AS department_count" not in capstone_solutions[2]:
    fail("Capstone step 3 does not measure distinct department breadth")
final_sql = capstone_solutions[-1]
for required in ("'Not enrolled'", "'Cross-disciplinary'", "'Focused'"):
    if required not in final_sql:
        fail(f"Final capstone status is missing {required}")
if "COUNT(c.id) AS course_count" in final_sql:
    fail("Inflated raw course count remains in final capstone")

# Progressive message starters must contain the previous full solution.
cap_msg_path = MESSAGE_DIR / "module3" / "final-school-program-participation-report.json"
cap_msg = load(cap_msg_path)
module_key = next(iter(cap_msg["topics"][SUBJECT]))
cap_node = cap_msg["topics"][SUBJECT][module_key]["final-school-program-participation-report"]
message_steps = list(cap_node["finalCapstone"]["steps"].values())
for index in range(1, len(message_steps)):
    previous_solution = message_steps[index - 1]["solutionCode"].strip()
    starter = message_steps[index]["starterCode"]
    if previous_solution not in starter:
        fail(f"Capstone step {index + 1} does not carry the complete previous solution")

# Execute every published SQL solution against the canonical dataset.
schema_and_seed = """
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, grade_level INTEGER NOT NULL);
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE courses (id INTEGER PRIMARY KEY, title TEXT NOT NULL, department_id INTEGER NOT NULL);
CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL, course_id INTEGER NOT NULL, term TEXT NOT NULL);
INSERT INTO students VALUES (1,'Mia',9),(2,'Leo',10),(3,'Ava',10),(4,'Noah',11),(5,'Emma',12),(6,'Liam',11);
INSERT INTO departments VALUES (1,'Science'),(2,'Math'),(3,'Humanities'),(4,'Technology'),(5,'Arts');
INSERT INTO courses VALUES (1,'Biology',1),(2,'Algebra II',2),(3,'World History',3),(4,'Computer Basics',4),(5,'Creative Writing',3);
INSERT INTO enrollments VALUES (1,1,1,'Spring 2026'),(2,1,2,'Spring 2026'),(3,2,2,'Spring 2026'),(4,2,3,'Spring 2026'),(5,3,4,'Spring 2026'),(6,4,1,'Spring 2026'),(7,4,4,'Spring 2026'),(8,5,3,'Spring 2026');
"""
connection = sqlite3.connect(":memory:")
connection.executescript(schema_and_seed)
sql_count = 0
for path in SUBJECT_DIR.rglob("topic.bundle.json"):
    bundle = load(path)
    for item in bundle["exercises"]:
        if item["kind"] != "code_input" or item.get("recipe", {}).get("type") != "sql_query":
            continue
        sql = item["recipe"].get("solutionCode", "").strip()
        if not sql:
            fail(f"Empty SQL solution: {path} / {item['id']}")
        try:
            connection.execute(sql).fetchall()
        except sqlite3.Error as error:
            fail(f"SQL execution failed: {path} / {item['id']}: {error}")
        sql_count += 1

rows = connection.execute(final_sql).fetchall()
liam = next((row for row in rows if row[0] == "Liam"), None)
if liam != ("Liam", 11, 0, 0, 0, "Not enrolled"):
    fail(f"Final capstone does not preserve Liam with zero participation: {liam}")

# Optional authoring checks after the hardener syncs source authoring.
authoring = ROOT / "authoring/subjects/sql/courses/multi-table-sql/course.spec.json"
if authoring.exists():
    authored = load(authoring)
    text = json.dumps(authored)
    if '"showChen": true' in text:
        fail("Authoring still enables Chen")
    capstone_topics: list[dict[str, Any]] = []
    for module in authored.get("modules", []):
        for section in module.get("sections", []):
            for topic in section.get("topics", []):
                if topic.get("topicId") == "final-school-program-participation-report":
                    capstone_topics.append(topic)
    if len(capstone_topics) != 1:
        fail(f"Expected one authored capstone topic, found {len(capstone_topics)}")
    authored_capstone = capstone_topics[0]
    if "Student Program Participation Audit" not in authored_capstone.get("title", ""):
        fail("Authoring capstone title was not synchronized")
    if authored_capstone.get("projectBrief", {}).get("stepCountTarget") != 4:
        fail("Authoring capstone step target is not 4")

print(f"Production validation passed: {json_count} JSON files, {sql_count} SQL solutions, 1 final capstone audit.")
