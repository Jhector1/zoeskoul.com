from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(sys.argv[1]).resolve()
DRAFT = ROOT / ".curriculum-drafts/sql"
SUBJECT = "sql--multi-table-sql--draft"
SUBJECT_DIR = DRAFT / "subjects" / SUBJECT
MESSAGE_DIR = DRAFT / "messages/en/subjects" / SUBJECT


def load(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: pathlib.Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def topic_bundle(module: int, topic: str) -> tuple[pathlib.Path, dict[str, Any]]:
    path = SUBJECT_DIR / "modules" / f"module{module}" / "topics" / topic / "topic.bundle.json"
    return path, load(path)


def topic_message(module: int, topic: str) -> tuple[pathlib.Path, dict[str, Any], dict[str, Any], dict[str, Any]]:
    path = MESSAGE_DIR / f"module{module}" / f"{topic}.json"
    data = load(path)
    module_key = next(iter(data["topics"][SUBJECT]))
    node = data["topics"][SUBJECT][module_key][topic]
    sketches = data.get("sketches", {}).get(SUBJECT, {}).get(module_key, {}).get(topic, {})
    return path, data, node, sketches


def exercise(bundle: dict[str, Any], exercise_id: str) -> dict[str, Any]:
    for item in bundle["exercises"]:
        if item["id"] == exercise_id:
            return item
    raise KeyError(exercise_id)


def set_solution(bundle: dict[str, Any], exercise_id: str, sql: str) -> None:
    item = exercise(bundle, exercise_id)
    item["recipe"]["solutionCode"] = sql.rstrip() + "\n"


def set_try_message(node: dict[str, Any], key: str, *, title: str, prompt: str, hint: str, concept: str, hint1: str, hint2: str, starter: str, solution: str) -> None:
    target = node["tryIt"][key]
    target.update({
        "title": title,
        "prompt": prompt,
        "hint": hint,
        "help": {"concept": concept, "hint_1": hint1, "hint_2": hint2},
        "starterCode": starter.rstrip() + "\n",
        "solutionCode": solution.rstrip() + "\n",
    })


def set_show_chen_false(value: Any) -> None:
    if isinstance(value, dict):
        if "showChen" in value:
            value["showChen"] = False
        for child in value.values():
            set_show_chen_false(child)
    elif isinstance(value, list):
        for child in value:
            set_show_chen_false(child)


def sketch_pair(sketches: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    keys = list(sketches)
    if len(keys) < 2:
        raise RuntimeError(f"Expected at least two sketches, found {keys}")
    return sketches[keys[0]], sketches[keys[1]]


# ---------------------------------------------------------------------------
# Runtime: ERD is used throughout this course; Chen notation is not taught.
# ---------------------------------------------------------------------------
manifest_path = SUBJECT_DIR / "subject.manifest.json"
manifest = load(manifest_path)
set_show_chen_false(manifest)
save(manifest_path, manifest)

for bundle_path in SUBJECT_DIR.glob("modules/module*/topics/*/topic.bundle.json"):
    bundle = load(bundle_path)
    set_show_chen_false(bundle)
    save(bundle_path, bundle)


# ---------------------------------------------------------------------------
# Module 0: relationship reading is conceptual-only.
# ---------------------------------------------------------------------------
path, bundle = topic_bundle(0, "reading-keys-and-relationships")
bundle["exercises"] = [item for item in bundle["exercises"] if item["kind"] != "code_input"]
# Replace the stale WHERE fill blank with a relationship-key check.
quiz6 = exercise(bundle, "quiz-6")
quiz6["expected"] = {"kind": "fill_blank_choice", "value": "id"}
save(path, bundle)

path, data, node, sketches = topic_message(0, "reading-keys-and-relationships")
node["cards"]["sketch0"]["title"] = "Read a Relationship Before You Join"
node["cards"]["sketch1"]["title"] = "Trace the Three Documented Key Paths"
node["practice"].pop("quiz-7", None)
node["practice"].pop("quiz-8", None)
node["practice"].update({
    "quiz-1": {
        "title": "Find the Student Identifier",
        "prompt": "Which column uniquely identifies one row in the `students` table?",
        "hint": "Look for the column declared as the table's primary key.",
        "help": {
            "concept": "A primary key uniquely identifies one row in its own table.",
            "hint_1": "Names and grade levels can repeat, but a primary-key value cannot.",
            "hint_2": "Use the schema browser and find the key marker on `students`.",
        },
        "options": {"a": "name", "b": "grade_level", "c": "id", "d": "student_id"},
    },
    "quiz-2": {
        "title": "Follow the Student Relationship",
        "prompt": "Which documented key pair connects an enrollment row to its student?",
        "hint": "Start with the foreign key stored on `enrollments`.",
        "help": {
            "concept": "A child table stores a foreign key that points to the parent's primary key.",
            "hint_1": "The enrollment row stores the student's identifier in `student_id`.",
            "hint_2": "Match that foreign key to the unique identifier on `students`.",
        },
        "options": {
            "a": "enrollments.id → students.id",
            "b": "enrollments.student_id → students.id",
            "c": "enrollments.course_id → students.id",
            "d": "students.grade_level → enrollments.student_id",
        },
    },
    "quiz-3": {
        "title": "Choose Valid Relationship Paths",
        "prompt": "Which key pairs are documented relationships in the school schema? Select all that apply.",
        "hint": "Use the foreign-key arrows in the ERD, not columns that merely share a type or name.",
        "help": {
            "concept": "A valid relationship compares a declared foreign key with the referenced primary key.",
            "hint_1": "Check the arrows leaving `courses` and `enrollments`.",
            "hint_2": "Reject any pair that connects unrelated `id` columns.",
        },
        "options": {
            "a": "courses.department_id → departments.id",
            "b": "enrollments.course_id → courses.id",
            "c": "students.id → departments.id",
            "d": "enrollments.student_id → students.id",
        },
    },
    "quiz-4": {
        "title": "Recognize a Foreign Key",
        "prompt": "Which statements describe a foreign key? Select all that apply.",
        "hint": "Think about where the value is stored and what table it points toward.",
        "help": {
            "concept": "A foreign key records the identity of a related parent row.",
            "hint_1": "The value may repeat because many child rows can point to one parent.",
            "hint_2": "It must reference the key on the related table, not just a similarly named column.",
        },
        "options": {
            "a": "It points to a key in a related table.",
            "b": "Its values may repeat across child rows.",
            "c": "It always uniquely identifies its own table row.",
            "d": "It defines a path the join can follow.",
        },
    },
    "quiz-5": {
        "title": "Trace a Relationship Safely",
        "prompt": "Arrange the steps for deciding how two requested tables are related before writing SQL.",
        "hint": "Start with the requested output, then verify the exact key path in the schema.",
        "help": {
            "concept": "Join planning begins with the requested tables and ends with a verified foreign-key path.",
            "hint_1": "Do not compare columns until you know which tables supply the requested fields.",
            "hint_2": "The last check is confirming that the foreign key points to the intended primary key.",
        },
        "tokens": {
            "t1": "Identify the tables that contain the requested fields",
            "t2": "Find the primary key on the parent table",
            "t3": "Find the matching foreign key on the related table",
            "t4": "Verify the relationship arrow in the ERD",
        },
    },
    "quiz-6": {
        "title": "Complete the Course Relationship",
        "prompt": "Complete the documented relationship from enrollments to courses.",
        "hint": "The foreign key `course_id` points to the course table's unique identifier.",
        "help": {
            "concept": "`enrollments.course_id` stores the identifier of the related course row.",
            "hint_1": "Look for the primary key on `courses`.",
            "hint_2": "Choose the column that uniquely identifies one course.",
        },
        "template": "`enrollments.course_id` references `courses.[blank1]`.",
        "choices": ["id", "title", "department_id", "name"],
    },
})
sketches["sketch-1"] = {
    "title": "Keys are the addresses that make relationships reliable",
    "bodyMarkdown": "Before writing a join, identify the exact key path in the schema. A **primary key** uniquely identifies one row in its own table. A **foreign key** stores the primary-key value of a related row.\n\nIn this dataset:\n\n- `students.id` identifies one student\n- `enrollments.student_id` points to that student\n- `courses.id` identifies one course\n- `enrollments.course_id` points to that course\n\nThe important habit is to follow a declared relationship, not to compare columns only because both are named `id` or contain similar numbers.",
}
sketches["sketch-2"] = {
    "title": "Trace the path from the requested output back to the keys",
    "bodyMarkdown": "Suppose a report needs a student name and a course title. The two values live in different entity tables, so trace the path in the ERD:\n\n```text\nstudents.id\n  ← enrollments.student_id\nenrollments.course_id\n  → courses.id\n```\n\nThe `enrollments` table is the bridge. You do not need to write the join yet. First be able to answer:\n\n1. Which table owns each requested field?\n2. Which primary key identifies each parent row?\n3. Which foreign key records the relationship?\n4. Does the ERD confirm that path?\n\nThat four-question check prevents wrong-key joins later.",
}
save(path, data)


# ---------------------------------------------------------------------------
# Module 0: keep qualification and table-alias practice to two tables.
# ---------------------------------------------------------------------------
qual0 = """SELECT enrollments.id AS enrollment_id,
       students.name AS student_name,
       enrollments.term
FROM enrollments
INNER JOIN students
  ON enrollments.student_id = students.id
ORDER BY enrollments.id;"""
qual1 = """SELECT courses.id AS course_id,
       courses.title AS course_title,
       departments.name AS department_name
FROM courses
INNER JOIN departments
  ON courses.department_id = departments.id
ORDER BY courses.id;"""
path, bundle = topic_bundle(0, "qualifying-columns-across-tables")
set_solution(bundle, "try-qualifying-columns-across-tables-sketch0", qual0)
set_solution(bundle, "try-qualifying-columns-across-tables-sketch1", qual1)
save(path, bundle)
path, data, node, sketches = topic_message(0, "qualifying-columns-across-tables")
set_try_message(node, "try_qualifying_columns_across_tables_sketch0",
    title="Disambiguate Enrollment and Student Columns",
    prompt="Return enrollment id, student name, and term from `enrollments` joined to `students`. Qualify every source column and give the two displayed identifiers readable aliases.",
    hint="Start from `enrollments`, then follow `student_id` to `students.id`.",
    concept="Qualification uses `table.column` to identify the source; an output alias changes only the displayed heading.",
    hint1="Use full table names in `SELECT` and in the `ON` condition.",
    hint2="Keep this a two-table query and order by the enrollment identifier.",
    starter="-- Return a readable enrollment-to-student result\n",
    solution=qual0)
set_try_message(node, "try_qualifying_columns_across_tables_sketch1",
    title="Disambiguate Course and Department Columns",
    prompt="Return course id, course title, and department name from `courses` joined to `departments`. Qualify every selected column and use stable output headings.",
    hint="The relationship is `courses.department_id = departments.id`.",
    concept="Qualified source columns keep a two-table query unambiguous even when both tables contain an `id` column.",
    hint1="Write each selected column as `table.column`.",
    hint2="Alias the displayed columns as `course_id`, `course_title`, and `department_name`.",
    starter="-- Return a readable course-to-department result\n",
    solution=qual1)
sketch_a, sketch_b = sketch_pair(sketches)
sketch_a["bodyMarkdown"] = "When joined tables both contain columns such as `id` or `name`, an unqualified reference can be ambiguous. Write the source explicitly:\n\n```sql\nSELECT enrollments.id, students.name\nFROM enrollments\nINNER JOIN students\n  ON enrollments.student_id = students.id;\n```\n\n`enrollments.id` means the enrollment record. `students.id` would mean the student record. Qualification answers **where the value comes from**."
sketch_b["title"] = "Source qualification and output aliases solve different problems"
sketch_b["bodyMarkdown"] = "A qualified reference identifies the source column. An output alias controls the result-table heading:\n\n```sql\nSELECT enrollments.id AS enrollment_id,\n       students.id AS student_id\nFROM enrollments\nINNER JOIN students\n  ON enrollments.student_id = students.id;\n```\n\nBoth expressions use a source table and column. The aliases make the two output headings distinct. Table aliases are introduced in the next topic; here, keep the full table names visible while you practice the distinction."
save(path, data)

alias0 = """SELECT c.title AS course_title,
       d.name AS department_name
FROM courses AS c
INNER JOIN departments AS d
  ON c.department_id = d.id
ORDER BY c.title;"""
alias1 = """SELECT s.name AS student_name,
       e.term AS enrollment_term,
       e.course_id
FROM students AS s
INNER JOIN enrollments AS e
  ON s.id = e.student_id
ORDER BY s.name, e.course_id;"""
path, bundle = topic_bundle(0, "table-aliases-for-join-queries")
set_solution(bundle, "try-table-aliases-for-join-queries-sketch0", alias0)
set_solution(bundle, "try-table-aliases-for-join-queries-sketch1", alias1)
save(path, bundle)
path, data, node, sketches = topic_message(0, "table-aliases-for-join-queries")
set_try_message(node, "try_table_aliases_for_join_queries_sketch0",
    title="Shorten a Course-to-Department Join",
    prompt="Use `c` and `d` as table aliases to return each course title with its department name. Keep the two-table relationship visible and sort by course title.",
    hint="Declare each alias beside its table, then use the same aliases in `SELECT` and `ON`.",
    concept="A table alias shortens repeated table references without changing the relationship being followed.",
    hint1="Use `courses AS c` and `departments AS d`.",
    hint2="The `ON` condition still compares `c.department_id` with `d.id`.",
    starter="-- Use short, consistent aliases for two related tables\n",
    solution=alias0)
set_try_message(node, "try_table_aliases_for_join_queries_sketch1",
    title="Keep Student and Enrollment Aliases Consistent",
    prompt="Use `s` and `e` as aliases to return student name, enrollment term, and course id. Sort by student name and then course id.",
    hint="Every qualified column should begin with either `s.` or `e.` after the aliases are declared.",
    concept="Consistent aliases make a join shorter while preserving which table supplies each value.",
    hint1="Join `s.id` to `e.student_id`.",
    hint2="Do not add `courses` yet; longer relationship paths belong to Module 1.",
    starter="-- Build a concise two-table student enrollment query\n",
    solution=alias1)
save(path, data)


# ---------------------------------------------------------------------------
# Module 0 project: distinguish output aliases from table aliases.
# ---------------------------------------------------------------------------
path, data, node, sketches = topic_message(0, "module-0-student-enrollment-roster")
steps = node["moduleProject"]["steps"]
for key, title, prompt in [
    ("step2", "Step 2: Give Duplicate IDs Clear Output Headings", "Continue the roster by aliasing the two displayed `id` columns as `student_id` and `enrollment_id`. Keep full table names and preserve the same rows."),
    ("step3", "Step 3: Shorten the Query with Table Aliases", "Replace the repeated table names with `s` and `e` while preserving the output headings and the same one-row-per-enrollment result."),
]:
    if key in steps:
        node.get("projectSteps", {}).setdefault(key, {})["title"] = title
        steps[key]["title"] = title
        steps[key]["prompt"] = prompt
        steps[key]["hint"] = "Change only the naming requirement for this step; keep the relationship and selected data intact."
        steps[key]["help"] = {
            "concept": "This project separates output aliases from table aliases so each change has one clear purpose.",
            "hint_1": "Output aliases appear after selected expressions; table aliases are declared after table names.",
            "hint_2": "Run the previous solution first, then make only the naming change requested here.",
        }
save(path, data)


# ---------------------------------------------------------------------------
# Module 1: correct grain language and remove duplicated repair tasks.
# ---------------------------------------------------------------------------
path, bundle = topic_bundle(1, "one-to-many-and-many-to-many-results")
fill2 = exercise(bundle, "fill-blank-choice-2")
fill2["expected"] = {"kind": "fill_blank_choice", "value": "one course"}
save(path, bundle)
path, data, node, sketches = topic_message(1, "one-to-many-and-many-to-many-results")
node["practice"]["fill-blank-choice-2"] = {
    "title": "Name the Result Grain",
    "prompt": "After joining departments to courses without grouping, what does one result row represent?",
    "hint": "Read the selected detail table and identify which row can repeat for one department.",
    "help": {
        "concept": "Result grain describes what one output row represents; it is not determined by a relationship label alone.",
        "hint_1": "A department can own several course rows.",
        "hint_2": "The ungrouped joined result has one row for each matching course.",
    },
    "template": "One result row represents [blank1] together with its department.",
    "choices": ["one course", "one department total", "one student", "one database"],
}
save(path, data)

avoid1 = """SELECT e.id AS enrollment_id,
       s.name AS student_name,
       c.title AS course_title
FROM enrollments AS e
INNER JOIN students AS s
  ON e.student_id = s.id
INNER JOIN courses AS c
  ON e.course_id = c.id
ORDER BY e.id;"""
path, bundle = topic_bundle(1, "avoiding-cartesian-and-wrong-key-joins")
set_solution(bundle, "try-avoiding-cartesian-and-wrong-key-joins-sketch1", avoid1)
save(path, bundle)
path, data, node, sketches = topic_message(1, "avoiding-cartesian-and-wrong-key-joins")
set_try_message(node, "try_avoiding_cartesian_and_wrong_key_joins_sketch1",
    title="Repair a Wrong-Key Enrollment Audit",
    prompt="Start from `enrollments` and return enrollment id, student name, and course title. Use each foreign key with its documented parent key and sort by enrollment id.",
    hint="`student_id` points to `students.id`; `course_id` points to `courses.id`.",
    concept="A wrong-key join can return plausible-looking rows even when the compared identifiers represent different entities.",
    hint1="Use one `ON` condition for each relationship leaving `enrollments`.",
    hint2="Starting from the bridge table makes the expected one-row-per-enrollment grain easy to verify.",
    starter="-- Repair the key path for an enrollment audit\n",
    solution=avoid1)
save(path, data)


# ---------------------------------------------------------------------------
# Module 2: ON versus WHERE must compare the same right-side condition.
# ---------------------------------------------------------------------------
on_sql = """SELECT d.name AS department_name,
       c.title AS history_course
FROM departments AS d
LEFT JOIN courses AS c
  ON d.id = c.department_id
 AND c.title LIKE '%History%'
ORDER BY d.name;"""
where_sql = """SELECT d.name AS department_name,
       c.title AS history_course
FROM departments AS d
LEFT JOIN courses AS c
  ON d.id = c.department_id
WHERE c.title LIKE '%History%'
ORDER BY d.name;"""
path, bundle = topic_bundle(2, "filtering-left-joins-with-on-and-where")
set_solution(bundle, "try-filtering-left-joins-with-on-and-where-sketch0", on_sql)
set_solution(bundle, "try-filtering-left-joins-with-on-and-where-sketch1", where_sql)
for item_id in ("multi-choice-1", "multi-choice-2"):
    item = exercise(bundle, item_id)
    if item["kind"] == "multi_choice":
        correct = item["expected"]["optionIds"][0]
        item["kind"] = "single_choice"
        item["expected"] = {"kind": "single_choice", "optionId": correct}
# Replace generic clause-order drag with the actual decision process.
drag = exercise(bundle, "drag-reorder-1")
drag["tokenIds"] = ["t1", "t2", "t3", "t4"]
drag["expected"] = {"kind": "drag_reorder", "tokenIds": ["t1", "t2", "t3", "t4"]}
save(path, bundle)
path, data, node, sketches = topic_message(2, "filtering-left-joins-with-on-and-where")
set_try_message(node, "try_filtering_left_joins_with_on_and_where_sketch0",
    title="Preserve Every Department While Limiting Matches",
    prompt="Return every department, but match only courses whose title contains `History`. Put the title condition inside `ON` so departments without a matching course remain visible.",
    hint="Add the title condition after the key comparison inside the `ON` clause.",
    concept="A right-table condition in `ON` limits which right rows match without removing preserved left rows.",
    hint1="Start from `departments` and use a `LEFT JOIN` to `courses`.",
    hint2="The final result should still contain all five departments.",
    starter="-- Keep every department while matching only History courses\n",
    solution=on_sql)
set_try_message(node, "try_filtering_left_joins_with_on_and_where_sketch1",
    title="Move the Same Condition to WHERE",
    prompt="Use the same department-to-course join and the same `History` title condition, but place the condition in `WHERE`. Observe that only departments with a matching course remain.",
    hint="Keep the key comparison in `ON`; move only the title condition below the join.",
    concept="A right-table condition in `WHERE` filters the completed result and removes rows whose right-side values are NULL.",
    hint1="Compare the row count with the previous Try It.",
    hint2="Only Humanities has a course title containing `History` in this dataset.",
    starter="-- Move the same right-table filter to WHERE\n",
    solution=where_sql)
node["practice"]["multi-choice-1"]["title"] = "What Does LEFT JOIN Preserve?"
node["practice"]["multi-choice-1"]["prompt"] = "Which statement correctly describes the preserved side of a LEFT JOIN?"
node["practice"]["multi-choice-2"]["title"] = "What Can a WHERE Filter Remove?"
node["practice"]["multi-choice-2"]["prompt"] = "What happens when `WHERE` requires a value from the nullable right side of a LEFT JOIN?"
node["practice"]["drag-reorder-1"] = {
    "title": "Choose Where the Right-Table Filter Belongs",
    "prompt": "Arrange the reasoning steps for deciding whether a right-table condition belongs in `ON` or `WHERE`.",
    "hint": "Decide first whether unmatched left rows must remain.",
    "help": {
        "concept": "Filter placement follows the report requirement, not a memorized clause order.",
        "hint_1": "Start by identifying the preserved table and the rows the report must keep.",
        "hint_2": "Use `ON` to limit matches; use `WHERE` to filter the finished result.",
    },
    "tokens": {
        "t1": "Identify which table's rows must be preserved",
        "t2": "Decide whether unmatched left rows must remain",
        "t3": "Put a match-limiting right-table condition in ON",
        "t4": "Put a final-result filter in WHERE",
    },
}
save(path, data)

# Convert one-answer multi_choice items to single_choice in two adjacent topics.
for module, topic, ids in [
    (2, "left-join-preserves-unmatched-rows", ["multi-choice-1", "multi-choice-2"]),
    (2, "finding-missing-relationships", ["multi-choice-2"]),
]:
    path, bundle = topic_bundle(module, topic)
    for item_id in ids:
        item = exercise(bundle, item_id)
        if item["kind"] == "multi_choice":
            correct = item["expected"]["optionIds"][0]
            item["kind"] = "single_choice"
            item["expected"] = {"kind": "single_choice", "optionId": correct}
    save(path, bundle)

# Replace generic count-clause ordering with metric/grain reasoning.
path, bundle = topic_bundle(2, "counting-related-rows-without-inflation")
drag = exercise(bundle, "quiz3")
drag["tokenIds"] = ["t1", "t2", "t3", "t4", "t5"]
drag["expected"] = {"kind": "drag_reorder", "tokenIds": ["t1", "t2", "t3", "t4", "t5"]}
save(path, bundle)
path, data, node, sketches = topic_message(2, "counting-related-rows-without-inflation")
node["practice"]["quiz3"] = {
    "title": "Plan a Join-Aware Count",
    "prompt": "Arrange the checks for building a grouped count that preserves empty groups and avoids duplicate inflation.",
    "hint": "Define the metric and result grain before choosing the count expression.",
    "help": {
        "concept": "A trustworthy joined count begins with the reporting grain and the entity being counted.",
        "hint_1": "Preserve the requested groups before adding detail tables.",
        "hint_2": "Use a right-side identifier for related rows and `DISTINCT` when the metric is unique entities.",
    },
    "tokens": {
        "t1": "State what one result row represents",
        "t2": "Choose the starting table whose groups must remain",
        "t3": "Follow the documented relationship path",
        "t4": "Count the identifier that matches the requested metric",
        "t5": "Verify zero groups and repeated entities in the result",
    },
}
save(path, data)


# ---------------------------------------------------------------------------
# Final capstone: change the grain so it is not Module 2 repeated.
# ---------------------------------------------------------------------------
cap_sql = [
"""SELECT s.name AS student_name,
       s.grade_level
FROM students AS s
LEFT JOIN enrollments AS e
  ON s.id = e.student_id
LEFT JOIN courses AS c
  ON e.course_id = c.id
LEFT JOIN departments AS d
  ON c.department_id = d.id
GROUP BY s.id, s.name, s.grade_level;""",
"""SELECT s.name AS student_name,
       s.grade_level,
       COUNT(e.id) AS enrollment_count,
       COUNT(DISTINCT c.id) AS course_count
FROM students AS s
LEFT JOIN enrollments AS e
  ON s.id = e.student_id
LEFT JOIN courses AS c
  ON e.course_id = c.id
LEFT JOIN departments AS d
  ON c.department_id = d.id
GROUP BY s.id, s.name, s.grade_level;""",
"""SELECT s.name AS student_name,
       s.grade_level,
       COUNT(e.id) AS enrollment_count,
       COUNT(DISTINCT c.id) AS course_count,
       COUNT(DISTINCT d.id) AS department_count
FROM students AS s
LEFT JOIN enrollments AS e
  ON s.id = e.student_id
LEFT JOIN courses AS c
  ON e.course_id = c.id
LEFT JOIN departments AS d
  ON c.department_id = d.id
GROUP BY s.id, s.name, s.grade_level;""",
"""SELECT s.name AS student_name,
       s.grade_level,
       COUNT(e.id) AS enrollment_count,
       COUNT(DISTINCT c.id) AS course_count,
       COUNT(DISTINCT d.id) AS department_count,
       CASE
         WHEN COUNT(e.id) = 0 THEN 'Not enrolled'
         WHEN COUNT(DISTINCT d.id) >= 2 THEN 'Cross-disciplinary'
         ELSE 'Focused'
       END AS participation_status
FROM students AS s
LEFT JOIN enrollments AS e
  ON s.id = e.student_id
LEFT JOIN courses AS c
  ON e.course_id = c.id
LEFT JOIN departments AS d
  ON c.department_id = d.id
GROUP BY s.id, s.name, s.grade_level
ORDER BY department_count DESC,
         enrollment_count DESC,
         student_name ASC;""",
]
cap_ids = ["step1-establish-grain", "step2-add-counts", "step3-add-distinct-students", "step4-label-rank"]
path, bundle = topic_bundle(3, "final-school-program-participation-report")
bundle["minutes"] = 100
bundle["cards"][1]["project"]["difficulty"] = "hard"
for step in bundle["cards"][1]["project"]["steps"]:
    step["difficulty"] = "hard"
for item_id, sql in zip(cap_ids, cap_sql):
    set_solution(bundle, item_id, sql)
save(path, bundle)

path, data, node, sketches = topic_message(3, "final-school-program-participation-report")
node["label"] = "Final Capstone: Student Program Participation Audit"
node["summary"] = "Build a one-row-per-student audit that preserves students with no enrollments and measures the breadth of each student's participation."
node["cards"]["sketch0"]["title"] = "Capstone Brief: Audit Participation by Student"
node["cards"]["project"]["title"] = "Final Capstone: Student Program Participation Audit"
sketches["sketch-intro"] = {
    "title": "Build a new report grain for the final challenge",
    "bodyMarkdown": "The Module 2 project summarized one row per department. This capstone changes the question: the counseling team needs **one row per student**, including students who are not enrolled anywhere.\n\nYour final report must contain:\n\n- `student_name`\n- `grade_level`\n- `enrollment_count`\n- `course_count`\n- `department_count`\n- `participation_status`\n\nFollow the full path `students → enrollments → courses → departments`, preserve every student with `LEFT JOIN`, count distinct courses and departments, and verify that Liam appears with zero participation. This is a portfolio report because it combines relationship planning, unmatched-row preservation, result grain, distinct counting, labeling, and deterministic ranking in one query.",
}
final = node["finalCapstone"]
steps = final["steps"]
cap_step_meta = [
    ("step1_establish_grain", "Step 1: Preserve the All-Student Grain", "Start from `students`, follow the complete relationship path with LEFT JOIN, and group so every student—including Liam—appears exactly once."),
    ("step2_add_counts", "Step 2: Add Enrollment and Course Counts", "Add `enrollment_count` and distinct `course_count` while preserving one row per student."),
    ("step3_add_distinct_students", "Step 3: Measure Department Breadth", "Add distinct `department_count` to show how many departments each student participates in."),
    ("step4_label_rank", "Step 4: Label and Rank Participation", "Add `participation_status`: `Not enrolled` for zero enrollments, `Cross-disciplinary` for two or more departments, otherwise `Focused`. Sort by department breadth, enrollment count, and student name."),
]
for index, (key, title, prompt) in enumerate(cap_step_meta):
    node.get("projectSteps", {}).setdefault(key, {})["title"] = title
    item = steps[key]
    item["title"] = title
    item["prompt"] = prompt
    item["hint"] = "Run the previous working query, preserve its grain, and add only the metric or label requested in this step."
    item["help"] = {
        "concept": "Each capstone step preserves one row per student while extending the same four-table relationship path.",
        "hint_1": "The left side must remain `students` so the unenrolled student is never lost.",
        "hint_2": "Use distinct entity identifiers for course and department breadth, then verify Liam's zero-count row.",
    }
    previous = "-- Start the student participation audit\n" if index == 0 else cap_sql[index - 1].rstrip() + "\n"
    if index == 0:
        starter = "-- Build one row per student and preserve students with no enrollments\n"
    else:
        starter = previous + f"\n-- {title}\n-- {prompt}\n"
    item["starterCode"] = starter
    item["solutionCode"] = cap_sql[index].rstrip() + "\n"
    for file_key in ("starterFiles", "solutionFiles"):
        if file_key in item:
            file_collection = item[file_key]
            nodes = file_collection.values() if isinstance(file_collection, dict) else file_collection
            for file_node in nodes:
                file_node["content"] = item["starterCode"] if file_key == "starterFiles" else item["solutionCode"]
save(path, data)

# Subject-level capstone labels/outcomes.
subject_message_path = MESSAGE_DIR / "subject.json"
subject_message = load(subject_message_path)
mod3 = subject_message["modules"][SUBJECT]["multi-table-sql-module-3-final-capstone"]
mod3["description"] = "Build one complete student participation audit that preserves unenrolled students and measures accurate course and department breadth."
mod3["outcomes"] = [
    "Plan the full students-to-departments relationship path from a reporting brief.",
    "Preserve every student while joining optional enrollment, course, and department rows.",
    "Calculate enrollment, distinct-course, and distinct-department counts at one-row-per-student grain.",
    "Add a clear participation label and deterministic counseling-priority ranking.",
]
section = subject_message["sections"][SUBJECT]["multi-table-sql-module-3-final-capstone"][f"{SUBJECT}-multi-table-sql-section-3-final-capstone"]
section["bullets"] = ["Final Capstone: Student Program Participation Audit"]
save(subject_message_path, subject_message)


# ---------------------------------------------------------------------------
# Replace compiler repair diagnostics with learner-facing, topic-specific help.
# ---------------------------------------------------------------------------
GENERIC = "This support text was repaired because the original wording revealed the answer too directly."
HELP_BY_TOPIC = {
    "reading-keys-and-relationships": (
        "This question checks whether a key pair follows a documented relationship in the school schema.",
        "Identify the parent table's primary key and the related table's foreign key.",
        "Use the ERD arrow; do not match columns only because their names or values look similar.",
        "Trace the key path in the ERD.",
    ),
    "inner-join-with-on": (
        "INNER JOIN keeps rows only when the `ON` comparison finds a match on both sides.",
        "Choose the foreign key that points to the related table's primary key.",
        "Check that the requested columns come from the two joined tables and that unmatched rows may disappear.",
        "Follow the declared key pair in the `ON` clause.",
    ),
    "qualifying-columns-across-tables": (
        "A qualified column uses `table.column` to show exactly which table supplies the value.",
        "Look for names such as `id` that appear in both joined tables.",
        "Separate source qualification from the output alias shown in the results table.",
        "Name the source table for every ambiguous column.",
    ),
    "table-aliases-for-join-queries": (
        "A table alias shortens a table reference and must be used consistently after it is declared.",
        "Declare the alias beside the table in `FROM` or `JOIN`.",
        "Use that same alias in both selected columns and the `ON` condition.",
        "Keep each alias consistent from `SELECT` through `ON`.",
    ),
    "one-to-many-and-many-to-many-results": (
        "Relationship shape explains why a parent may repeat and what one joined result row represents.",
        "Identify the detail or bridge row that can repeat for one parent.",
        "State the result grain in plain language before deciding whether repeated rows are correct.",
        "Ask what one output row represents.",
    ),
    "joining-through-a-bridge-table": (
        "The `enrollments` bridge connects students to courses through two separate key relationships.",
        "Join students to enrollments first, then enrollments to courses.",
        "Use one `ON` clause for each foreign-key arrow and keep one row per enrollment.",
        "Follow both sides of the enrollment bridge.",
    ),
    "extending-a-join-path": (
        "A longer join should extend an already-correct path by one documented relationship.",
        "Keep the existing student-enrollment-course joins unchanged.",
        "Add departments only through `courses.department_id = departments.id`.",
        "Add one verified relationship at a time.",
    ),
    "avoiding-cartesian-and-wrong-key-joins": (
        "Every joined table needs a documented `ON` condition that preserves the intended result grain.",
        "Check whether a missing condition would combine every row with every other row.",
        "Verify the meaning of both compared identifiers instead of matching unrelated `id` columns.",
        "Verify every `ON` condition against the ERD.",
    ),
    "left-join-preserves-unmatched-rows": (
        "LEFT JOIN preserves every row from the chosen left table and fills missing right-side values with NULL.",
        "Identify which table the report says must remain complete.",
        "Start from that table and check the unmatched row in the results after running the query.",
        "Choose the table whose rows must all remain.",
    ),
    "filtering-left-joins-with-on-and-where": (
        "A right-table condition in `ON` limits matches; the same condition in `WHERE` can remove unmatched left rows.",
        "Decide whether the report must preserve left rows with no qualifying match.",
        "Compare the row count when the same right-table condition moves from `ON` to `WHERE`.",
        "Decide whether unmatched left rows must survive.",
    ),
    "finding-missing-relationships": (
        "The anti-join pattern preserves left rows, then selects those whose right-side identifier is NULL.",
        "Start from the entities you want to audit for missing relationships.",
        "Check a non-nullable key from the right table with `IS NULL` after the LEFT JOIN.",
        "Preserve the audited table, then check the right-side key for NULL.",
    ),
    "counting-related-rows-without-inflation": (
        "Joined counts must match the requested entity and the stated result grain.",
        "Count a right-side identifier so unmatched groups produce zero instead of one.",
        "Use `DISTINCT` when the metric is unique entities that may repeat across joined detail rows.",
        "Name the metric and result grain before choosing COUNT.",
    ),
}

for message_path in MESSAGE_DIR.glob("module*/*.json"):
    topic = message_path.stem
    if topic not in HELP_BY_TOPIC:
        continue
    data = load(message_path)
    concept, hint1, hint2, short_hint = HELP_BY_TOPIC[topic]

    def clean(value: Any) -> None:
        if isinstance(value, dict):
            help_node = value.get("help")
            if isinstance(help_node, dict) and help_node.get("concept") == GENERIC:
                value["help"] = {"concept": concept, "hint_1": hint1, "hint_2": hint2}
                if isinstance(value.get("hint"), str) and value["hint"].startswith("Use the lesson explanation"):
                    value["hint"] = short_hint
            for child in value.values():
                clean(child)
        elif isinstance(value, list):
            for child in value:
                clean(child)

    clean(data)
    save(message_path, data)


# ---------------------------------------------------------------------------
# Authoring sync: durable boundaries for future regeneration.
# ---------------------------------------------------------------------------
authoring_dir = ROOT / "authoring/subjects/sql/courses/multi-table-sql"
for filename in ("course.blueprint.json", "course.plan.json", "course.spec.json"):
    authoring_path = authoring_dir / filename
    if not authoring_path.exists():
        continue
    authored = load(authoring_path)
    set_show_chen_false(authored)

    if filename == "course.blueprint.json":
        notes = authored.setdefault("courseGenerationPolicy", {}).setdefault("notes", [])
        additions = [
            "Reading Keys and Relationships is conceptual-only: use schema and ERD reasoning with no JOIN-writing Try It.",
            "Module 0 code practice must use no more than two tables; bridge-table and four-table paths begin in Module 1.",
            "Filtering LEFT JOINs with ON and WHERE must compare the same right-table condition in both locations and require learners to inspect which left rows remain.",
            "The final capstone uses one-row-per-student grain and must not repeat the Module 2 one-row-per-department scorecard.",
            "Never publish compiler repair diagnostics as learner help text, and never author multi_choice with fewer than two correct options.",
        ]
        for addition in additions:
            if addition not in notes:
                notes.append(addition)

    def patch_authored(value: Any) -> None:
        if isinstance(value, dict):
            if value.get("moduleNumber") == 3 or value.get("moduleSlug") == "multi-table-sql-module-3-final-capstone":
                value["title"] = "Final Capstone"
                value["description"] = "Build one complete student participation audit that preserves unenrolled students and reports accurate course and department breadth."
                value["purpose"] = "Integrate relationship paths, LEFT JOIN, join-aware grain, distinct counting, and reporting labels in a new one-row-per-student portfolio query."
                value["learningObjectives"] = [
                    "Plan the full students-to-departments relationship path from a reporting brief.",
                    "Preserve every student while joining optional enrollment, course, and department rows.",
                    "Calculate enrollment, distinct-course, and distinct-department counts at one-row-per-student grain.",
                    "Add a clear participation label and deterministic counseling-ready ranking.",
                ]
                value["guidedExercises"] = [
                    "Establish and verify one-row-per-student grain.",
                    "Build the complete report in four cumulative steps.",
                    "Validate Liam's zero-count row, distinct metrics, labels, aliases, and ordering.",
                ]
                value["moduleProject"] = "Build the final Student Program Participation Audit."

            topic_id = value.get("topicId")
            if topic_id == "reading-keys-and-relationships":
                value["technical"] = False
                value["summary"] = "Trace documented primary-key and foreign-key pairs in the schema and ERD before writing a join."
                value["practice"] = {
                    "tryIt": False,
                    "requiresTryIt": False,
                    "tryItPlacement": "none",
                    "runtimeMode": "sql_workspace",
                    "expectedPracticeKinds": [],
                    "conceptualOnly": True,
                }
            elif topic_id == "qualifying-columns-across-tables":
                value["summary"] = "Qualify source columns and output headings in focused two-table joins before longer paths are introduced."
                goals = value.setdefault("learningGoals", [])
                boundary = "Keep every example and Try It in this topic to exactly two related tables."
                if boundary not in goals:
                    goals.append(boundary)
            elif topic_id == "table-aliases-for-join-queries":
                goals = value.setdefault("learningGoals", [])
                boundary = "Practice aliases with exactly two related tables; reserve bridge and four-table joins for Module 1."
                if boundary not in goals:
                    goals.append(boundary)
            elif topic_id == "filtering-left-joins-with-on-and-where":
                value["summary"] = "Move the same right-table condition between ON and WHERE and compare which unmatched left rows survive."
                goals = value.setdefault("learningGoals", [])
                exact = "Use the same right-table filter in paired ON and WHERE exercises and compare the actual result rows."
                if exact not in goals:
                    goals.append(exact)
            elif topic_id == "module-0-student-enrollment-roster":
                brief = value.get("projectBrief")
                if isinstance(brief, dict):
                    ladder = brief.get("stepLadder", [])
                    if len(ladder) >= 3:
                        ladder[1]["title"] = "Give Duplicate IDs Clear Output Headings"
                        ladder[1]["requirement"] = "Keep full table names and alias the displayed identifiers as student_id and enrollment_id without changing the rows."
                        ladder[2]["title"] = "Shorten the Query with Table Aliases"
                        ladder[2]["requirement"] = "Replace repeated table names with s and e while preserving the output aliases and one-row-per-enrollment grain."
            elif topic_id == "final-school-program-participation-report":
                value["title"] = "Final Capstone: Student Program Participation Audit"
                value["summary"] = "Build one row per student, preserve students with no enrollments, and measure participation across courses and departments."
                value["minutes"] = 100
                value["difficulty"] = "advanced"
                value["learningGoals"] = [
                    "Preserve every student, including students with no enrollment rows.",
                    "Keep one row per student while joining through enrollments, courses, and departments.",
                    "Calculate accurate enrollment, distinct-course, and distinct-department counts.",
                    "Finish with a participation label and stable counseling-ready ranking.",
                ]
                brief = value.setdefault("projectBrief", {})
                brief.update({
                    "scenario": "The counseling team needs a student participation audit that includes every student and shows how broadly each learner participates across school programs.",
                    "role": "SQL reporting specialist",
                    "workspace": "Browser SQL editor, schema browser, ERD, and deterministic results table",
                    "deliverable": "A portfolio-quality one-row-per-student participation audit built through four cumulative SQL steps.",
                    "stepCountTarget": 4,
                    "flow": "progressive",
                    "requirements": [
                        "Preserve all students from the first step through the final query.",
                        "Use the relationship path students → enrollments → courses → departments.",
                        "Keep one row per student throughout the capstone.",
                        "Count enrollment rows, distinct courses, and distinct departments using their identifiers.",
                        "Use the previous full solution as the next starter query.",
                        "Finish with exact aliases and deterministic ordering.",
                        "Do not use subqueries, CTEs, window functions, or mutation SQL.",
                    ],
                    "stepLadder": [
                        {"step": 1, "title": "Preserve the All-Student Grain", "requirement": "Start from students, LEFT JOIN through enrollments, courses, and departments, and group so every student appears once."},
                        {"step": 2, "title": "Add Enrollment and Course Counts", "requirement": "Add enrollment_count and COUNT(DISTINCT course id) as course_count without changing the student grain."},
                        {"step": 3, "title": "Measure Department Breadth", "requirement": "Add COUNT(DISTINCT department id) as department_count."},
                        {"step": 4, "title": "Label and Rank Participation", "requirement": "Label zero enrollments as Not enrolled, two or more departments as Cross-disciplinary, otherwise Focused; sort by department_count, enrollment_count, and student name."},
                    ],
                })
            for child in value.values():
                patch_authored(child)
        elif isinstance(value, list):
            for child in value:
                patch_authored(child)

    patch_authored(authored)
    save(authoring_path, authored)

print("Multi-Table SQL production hardening applied.")
