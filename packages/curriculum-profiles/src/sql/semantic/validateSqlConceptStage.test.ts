import { describe, expect, it } from "vitest";
import { validateSqlConceptStage } from "./validateSqlConceptStage.js";

function makeSeed(moduleOrder: number) {
    return {
        subjectSlug: "sql-v2",
        courseSlug: "sql-foundations",
        topicId: "what_sql_means",
        moduleOrder,
        authoringPolicy: {
            allowedConcepts: [
                "SELECT",
                "FROM",
                "WHERE",
                "comparison_operators",
                "AND",
                "OR",
                "NOT",
                "ORDER BY",
                "ASC",
                "DESC",
                "LIMIT",
                "LIKE",
                "IN",
                "NOT IN",
                "BETWEEN",
                "IS NULL",
                "IS NOT NULL",
            ],
            disallowedConcepts: [
                "JOIN",
                "GROUP BY",
                "HAVING",
                "INSERT",
                "UPDATE",
                "DELETE",
                "CREATE TABLE",
                "subquery",
            ],
            moduleRules: {
                "0": {
                    allowedConcepts: ["SELECT", "FROM"],
                    disallowedConcepts: [
                        "WHERE",
                        "comparison_operators",
                        "AND",
                        "OR",
                        "NOT",
                        "ORDER BY",
                        "ASC",
                        "DESC",
                        "LIMIT",
                        "LIKE",
                        "IN",
                        "NOT IN",
                        "BETWEEN",
                        "IS NULL",
                        "IS NOT NULL",
                        "JOIN",
                        "GROUP BY",
                        "HAVING",
                        "INSERT",
                        "UPDATE",
                        "DELETE",
                        "CREATE TABLE",
                        "subquery",
                    ],
                },
            },
        },
    } as any;
}

function makeDraft(solutionCode: string) {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 10,
        sketchBlocks: [],
        quizDraft: [
            {
                id: "code-1",
                kind: "code_input",
                title: "Code",
                prompt: "Write a query.",
                hint: "Use the lesson pattern.",
                help: {
                    concept: "Return the requested result.",
                    hint_1: "Check the table.",
                    hint_2: "Run the query.",
                },
                starterCode: "SELECT * FROM students;",
                solutionCode,
                recipeType: "sql_query",
                datasetId: "students_intro",
            },
        ],
    } as any;
}

describe("validateSqlConceptStage", () => {
    it("fails when module 0 draft contains INSERT", () => {
        const issues = validateSqlConceptStage({
            seed: makeSeed(0),
            draft: makeDraft("INSERT INTO students (id, student_name) VALUES (9, 'Kai');"),
        });

        expect(issues.some((issue) => issue.message.includes("INSERT"))).toBe(true);
    });

    it("fails when module 0 draft contains UPDATE", () => {
        const issues = validateSqlConceptStage({
            seed: makeSeed(0),
            draft: makeDraft("UPDATE students SET grade_level = 8 WHERE id = 1;"),
        });

        expect(issues.some((issue) => issue.message.includes("UPDATE"))).toBe(true);
    });

    it("passes when module 0 draft stays within safe starter SELECT concepts", () => {
        const issues = validateSqlConceptStage({
            seed: makeSeed(0),
            draft: makeDraft("SELECT student_name FROM students;"),
        });

        expect(issues).toHaveLength(0);
    });

    it("accepts human-readable comparison operator labels from authoring policy", () => {
        const seed = makeSeed(2);
        seed.authoringPolicy.allowedConcepts = seed.authoringPolicy.allowedConcepts.map(
            (concept: string) =>
                concept === "comparison_operators" ? "comparison operators" : concept,
        );

        const issues = validateSqlConceptStage({
            seed,
            draft: makeDraft("SELECT student_name FROM students WHERE grade_level = 8;"),
        });

        expect(issues).toHaveLength(0);
    });
});

describe("join-type concept staging", () => {
    function makeJoinSeed(allowedConcepts: string[], disallowedConcepts: string[]) {
        return {
            subjectSlug: "sql",
            courseSlug: "multi-table-sql",
            topicId: "join-topic",
            moduleOrder: 1,
            authoringPolicy: {
                allowedConcepts,
                disallowedConcepts,
                moduleRules: {},
            },
        } as any;
    }

    it("allows INNER JOIN when the course stage permits it", () => {
        const issues = validateSqlConceptStage({
            seed: makeJoinSeed(
                ["SELECT", "FROM", "JOIN", "INNER JOIN", "comparison_operators"],
                ["LEFT JOIN"],
            ),
            draft: makeDraft(
                "SELECT s.name FROM students AS s INNER JOIN enrollments AS e ON e.student_id = s.id;",
            ),
        });

        expect(issues).toHaveLength(0);
    });

    it("rejects LEFT JOIN before the outer-join module", () => {
        const issues = validateSqlConceptStage({
            seed: makeJoinSeed(
                ["SELECT", "FROM", "JOIN", "INNER JOIN", "comparison_operators"],
                ["LEFT JOIN"],
            ),
            draft: makeDraft(
                "SELECT s.name FROM students AS s LEFT JOIN enrollments AS e ON e.student_id = s.id;",
            ),
        });

        expect(issues.some((issue) => issue.message.includes("LEFT JOIN"))).toBe(true);
    });
});
