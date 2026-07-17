import { describe, expect, it } from "vitest";
import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { repairSqlDraft } from "./repairSqlDraft.js";

describe("repairSqlDraft", () => {
    it("fills a missing non-code kind from topic goals and repairs a revealed SQL starter", async () => {
        const seed = {
            profileId: "sql",
            topicId: "counting-related-rows-without-inflation",
            title: "Counting Related Rows Without Inflation",
            summary: "Count related rows while preserving the intended result grain.",
            topicLearningGoals: [
                "Use COUNT(right_table.id) so unmatched rows produce zero.",
                "Use COUNT(DISTINCT entity_id) for unique-entity metrics.",
                "State grouped result grain before choosing the count expression.",
            ],
            plannedExerciseCounts: {
                total: 4,
                dominantKind: "multi_choice",
                counts: {
                    single_choice: 1,
                    multi_choice: 2,
                    drag_reorder: 0,
                    fill_blank_choice: 0,
                    code_input: 1,
                },
            },
        } as unknown as TopicSeed;

        const sql = "SELECT department_id, COUNT(DISTINCT student_id) FROM enrollments GROUP BY department_id;";
        const draft = {
            title: seed.title,
            summary: seed.summary,
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single",
                    kind: "single_choice",
                    title: "Choose",
                    prompt: "Which count avoids duplicate students?",
                    hint: "Think distinct.",
                    help: {
                        concept: "Unique entities need a distinct count.",
                        hint_1: "Count the entity id.",
                        hint_2: "Remove duplicates.",
                    },
                    options: [
                        "COUNT(DISTINCT student_id)",
                        "COUNT(*)",
                        "SUM(student_id)",
                        "MIN(student_id)",
                    ],
                    correctOptionIds: ["a"],
                },
                {
                    id: "multi",
                    kind: "multi_choice",
                    title: "Select",
                    prompt: "Which rules are safe?",
                    hint: "Use the topic goals.",
                    help: {
                        concept: "Counts must match result grain.",
                        hint_1: "Check nullable right-side identifiers.",
                        hint_2: "Check distinct entities.",
                    },
                    options: [
                        "Count the right-side id",
                        "Use DISTINCT for unique entities",
                        "Ignore duplicates",
                        "Count unrelated rows",
                    ],
                    correctOptionIds: ["a", "b"],
                },
                {
                    id: "sql",
                    kind: "code_input",
                    title: "Count",
                    prompt: "Count unique students by department.",
                    hint: "Use COUNT(DISTINCT).",
                    help: {
                        concept: "Count unique students.",
                        hint_1: "Group by department.",
                        hint_2: "Use DISTINCT.",
                    },
                    recipeType: "sql_query",
                    fixedLanguage: "sql",
                    fixedSqlDialect: "sqlite",
                    entryFilePath: "query.sql",
                    starterCode: sql,
                    solutionCode: sql,
                    starterFiles: [
                        {
                            path: "schema.sql",
                            content: "CREATE TABLE enrollments (student_id INTEGER, department_id INTEGER);",
                            language: "sql",
                            readOnly: true,
                        },
                        {
                            path: "query.sql",
                            content: sql,
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "schema.sql",
                            content: "CREATE TABLE enrollments (student_id INTEGER, department_id INTEGER);",
                            language: "sql",
                            readOnly: true,
                        },
                        {
                            path: "query.sql",
                            content: sql,
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    sqlFileOrder: ["schema.sql", "query.sql"],
                },
            ],
        } as unknown as TopicAuthoringDraft;

        const result = await repairSqlDraft({ seed, draft });
        const counts = result.draft.quizDraft.reduce<Record<string, number>>(
            (acc, exercise) => {
                acc[exercise.kind] = (acc[exercise.kind] ?? 0) + 1;
                return acc;
            },
            {},
        );

        expect(result.draft.quizDraft).toHaveLength(4);
        expect(counts.single_choice).toBe(1);
        expect(counts.multi_choice).toBe(2);
        expect(counts.code_input).toBe(1);

        const added = result.draft.quizDraft.find(
            (exercise) =>
                exercise.kind === "multi_choice" &&
                exercise.id !== "multi",
        );
        expect(added).toMatchObject({
            kind: "multi_choice",
            correctOptionIds: ["a", "b"],
        });
        expect(
            (added as Extract<
                TopicAuthoringDraft["quizDraft"][number],
                { kind: "multi_choice" }
            >).options,
        ).toEqual(
            expect.arrayContaining([
                seed.topicLearningGoals![0],
                seed.topicLearningGoals![1],
            ]),
        );

        const repairedSql = result.draft.quizDraft.find(
            (exercise) => exercise.id === "sql",
        ) as Extract<
            TopicAuthoringDraft["quizDraft"][number],
            { kind: "code_input" }
        >;
        expect(repairedSql.starterCode).not.toBe(sql);
        expect(repairedSql.solutionCode).toBe(sql);

        const repairedStarterFiles = repairedSql.starterFiles ?? [];
        const repairedQueryFile = repairedStarterFiles.find(
            (file) => file.path === "query.sql",
        );
        const preservedSchemaFile = repairedStarterFiles.find(
            (file) => file.path === "schema.sql",
        );
        const solutionQueryFile = (repairedSql.solutionFiles ?? []).find(
            (file) => file.path === "query.sql",
        );

        expect(repairedQueryFile?.content).toBe(repairedSql.starterCode);
        expect(preservedSchemaFile?.content).toBe(
            "CREATE TABLE enrollments (student_id INTEGER, department_id INTEGER);",
        );
        expect(solutionQueryFile?.content).toBe(sql);

        expect(result.report.repairs.map((entry) => entry.code)).toEqual(
            expect.arrayContaining([
                "SQL_EXERCISE_POLICY_KIND_UNDER_TARGET_FILLED",
                "SQL_STARTER_REVEALED_SOLUTION_REPAIRED",
            ]),
        );
    });

    it("replaces bare DEFAULT values in SQLite seed files with schema-declared defaults", async () => {
        const schemaSql = `
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT NULL
);
`.trim();
        const seedSql = `
INSERT INTO products (
    id,
    sku,
    name,
    price,
    status,
    notes
) VALUES
    (1, 'SKU001', 'Product A', 10.99, 'active', NULL),
    (2, 'SKU002', 'Product B', 15.99, DEFAULT, 'New arrival');
`.trim();
        const querySql =
            "SELECT id, sku, status FROM products ORDER BY id;";

        const seed = {
            profileId: "sql",
            topicId: "final-inventory-operations-launch",
            title: "Final Inventory Operations Launch",
            summary: "Prepare the inventory workspace.",
            moduleRuntimeDefaults: {
                kind: "sql",
                fixedSqlDialect: "sqlite",
                datasetId: "ddl_blank",
                resultShape: "table",
            },
        } as unknown as TopicSeed;
        const draft = {
            title: seed.title,
            summary: seed.summary,
            minutes: 80,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "capstone-seed",
                    kind: "code_input",
                    title: "Seed products",
                    prompt: "Seed products and verify their status.",
                    hint: "Use the supplied files.",
                    help: {
                        concept: "SQLite seed data",
                        hint_1: "Create the table first.",
                        hint_2: "Then insert rows.",
                    },
                    recipeType: "sql_query",
                    fixedLanguage: "sql",
                    fixedSqlDialect: "sqlite",
                    datasetId: "ddl_blank",
                    entryFilePath: "query.sql",
                    starterCode: "-- Verify the seeded rows.\n",
                    solutionCode: querySql,
                    starterFiles: [
                        {
                            path: "schema.sql",
                            content: schemaSql,
                            language: "sql",
                            readOnly: false,
                        },
                        {
                            path: "seed.sql",
                            content: seedSql,
                            language: "sql",
                            readOnly: false,
                        },
                        {
                            path: "query.sql",
                            content: "-- Verify the seeded rows.\n",
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "schema.sql",
                            content: schemaSql,
                            language: "sql",
                            readOnly: false,
                        },
                        {
                            path: "seed.sql",
                            content: seedSql,
                            language: "sql",
                            readOnly: false,
                        },
                        {
                            path: "query.sql",
                            content: querySql,
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    sqlFileOrder: [
                        "schema.sql",
                        "seed.sql",
                        "query.sql",
                    ],
                    checkSql:
                        "SELECT id, sku, status FROM products ORDER BY id;",
                },
            ],
        } as unknown as TopicAuthoringDraft;

        const result = await repairSqlDraft({ seed, draft });
        const exercise = result.draft.quizDraft[0];
        expect(exercise.kind).toBe("code_input");
        if (exercise.kind !== "code_input") return;

        const starterSeed = exercise.starterFiles?.find(
            (file) => file.path === "seed.sql",
        )?.content;
        const solutionSeed = exercise.solutionFiles?.find(
            (file) => file.path === "seed.sql",
        )?.content;

        expect(starterSeed).not.toMatch(/\bDEFAULT\b/);
        expect(solutionSeed).not.toMatch(/\bDEFAULT\b/);
        expect(starterSeed).toContain(
            "(2, 'SKU002', 'Product B', 15.99, 'draft', 'New arrival')",
        );
        expect(solutionSeed).toContain(
            "(2, 'SKU002', 'Product B', 15.99, 'draft', 'New arrival')",
        );
        expect(
            result.report.repairs.map((repair) => repair.code),
        ).toContain("SQLITE_SEED_DEFAULT_VALUE_REPAIRED");

        const repairedAgain = await repairSqlDraft({
            seed,
            draft: result.draft,
        });
        expect(
            repairedAgain.report.repairs.map(
                (repair) => repair.code,
            ),
        ).not.toContain("SQLITE_SEED_DEFAULT_VALUE_REPAIRED");
    });
});
