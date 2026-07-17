import { describe, expect, it } from "vitest";
import { validateWorkedExampleTryItDistinctness } from "./validateWorkedExampleTryItDistinctness.js";

function seed(overrides: Record<string, unknown> = {}) {
    return {
        topicId: "joins",
        sectionSlug: "joins",
        practice: {
            conceptualOnly: false,
            requiresTryIt: true,
            tryItPlacement: "all_sketches",
        },
        ...overrides,
    } as any;
}

function codeInput(solutionCode: string, fixedLanguage: string = "sql") {
    return {
        id: "try-joins-sketch0",
        kind: "code_input",
        title: "Try it",
        prompt: "Build a related result.",
        hint: "Use the relationship.",
        help: {
            concept: "Join related rows.",
            hint_1: "Use the key pair.",
            hint_2: "Choose different output values.",
        },
        starterCode: "-- Write your answer",
        fixedLanguage,
        solutionCode,
    } as any;
}

describe("validateWorkedExampleTryItDistinctness", () => {
    it("rejects an exact copy of a worked example", () => {
        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "python",
            seed: seed(),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Example",
                        bodyMarkdown: "```python\nprint('hello')\n```",
                    },
                ],
                quizDraft: [codeInput("print('hello')\n", "python")],
            } as any,
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
                exerciseId: "try-joins-sketch0",
                severity: "error",
            }),
        ]);
    });

    it("rejects the same SQL expectation even when aliases and ordering differ", () => {
        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "sql",
            seed: seed(),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Course example",
                        bodyMarkdown: [
                            "```sql",
                            "SELECT courses.title, departments.name",
                            "FROM courses",
                            "INNER JOIN departments ON courses.department_id = departments.id;",
                            "```",
                        ].join("\n"),
                    },
                ],
                quizDraft: [
                    codeInput([
                        "SELECT c.title AS course_title, d.name AS department_name",
                        "FROM courses AS c",
                        "JOIN departments AS d ON c.department_id = d.id",
                        "ORDER BY c.title;",
                    ].join("\n")),
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
        );
    });

    it("accepts a Try It with a materially different expected result", () => {
        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "sql",
            seed: seed(),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Course example",
                        bodyMarkdown: [
                            "```sql",
                            "SELECT courses.title, departments.name",
                            "FROM courses",
                            "JOIN departments ON courses.department_id = departments.id;",
                            "```",
                        ].join("\n"),
                    },
                ],
                quizDraft: [
                    codeInput([
                        "SELECT departments.name, courses.id",
                        "FROM departments",
                        "JOIN courses ON departments.id = courses.department_id;",
                    ].join("\n")),
                ],
            } as any,
        });

        expect(issues).toEqual([]);
    });

    it("rejects a duplicate stored in a non-entry solution file", () => {
        const exercise = codeInput("SELECT 'different';");
        exercise.solutionFiles = [
            {
                path: "operations.sql",
                content: "INSERT INTO inventory_items (name) VALUES ('Notebook');",
                language: "sql",
            },
            {
                path: "query.sql",
                content: "SELECT * FROM inventory_items WHERE name = 'Notebook';",
                language: "sql",
            },
        ];

        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "sql",
            seed: seed(),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Course example",
                        bodyMarkdown: [
                            "```sql",
                            "INSERT INTO inventory_items (name) VALUES ('Notebook');",
                            "```",
                        ].join("\n"),
                    },
                ],
                quizDraft: [exercise],
            } as any,
        });

        expect(issues).toEqual([
            expect.objectContaining({
                code: "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
                message: expect.stringContaining("solutionFiles/operations.sql"),
            }),
        ]);
    });

    it("checks existing code_input exercises even when requiresTryIt metadata is absent", () => {
        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "sql",
            seed: seed({ practice: undefined }),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Course example",
                        bodyMarkdown: "```sql\nSELECT * FROM products;\n```",
                    },
                ],
                quizDraft: [codeInput("SELECT * FROM products;")],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "WORKED_EXAMPLE_TRY_IT_DUPLICATE",
        );
    });

    it("does not apply the rule to project or capstone topics", () => {
        const issues = validateWorkedExampleTryItDistinctness({
            profileId: "sql",
            seed: seed({ topicId: "final-capstone" }),
            draft: {
                sketchBlocks: [
                    {
                        id: "sketch0",
                        title: "Project synopsis",
                        bodyMarkdown: "```sql\nSELECT 1;\n```",
                    },
                ],
                quizDraft: [codeInput("SELECT 1;")],
            } as any,
        });

        expect(issues).toEqual([]);
    });
});
