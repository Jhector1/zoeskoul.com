import { describe, expect, it } from "vitest";
import { sanitizeGeneratedTopicAuthoringDraft } from "./sanitizeGeneratedTopicAuthoringDraft.js";

describe("sanitizeGeneratedTopicAuthoringDraft SQL files", () => {
    it("preserves ordered SQL workspace files and derives entry-file code", () => {
        const draft = sanitizeGeneratedTopicAuthoringDraft({
            title: "Create a table",
            summary: "Separate schema and verification work.",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-files",
                    kind: "code_input",
                    title: "Create and inspect",
                    prompt: "Use the provided SQL files.",
                    hint: "Schema first, query last.",
                    help: { concept: "Ordered SQL files", hint_1: "Use schema.sql", hint_2: "Use query.sql" },
                    starterCode: "-- stale scalar starter that must not win\n",
                    solutionCode: "-- stale scalar solution that must not win\n",
                    recipeType: "sql_query",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "schema.sql",
                            content: "-- create table\r\n",
                            language: "sql",
                            isEntry: false,
                            entry: false,
                            readOnly: false,
                        },
                        {
                            path: "query.sql",
                            content: "SELECT name FROM sqlite_master;\r\n",
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "schema.sql",
                            content: "CREATE TABLE warehouses (id INTEGER);\r\n",
                            language: "sql",
                            isEntry: false,
                            entry: false,
                            readOnly: false,
                        },
                        {
                            path: "query.sql",
                            content: "SELECT name, sql FROM sqlite_master;\r\n",
                            language: "sql",
                            isEntry: true,
                            entry: true,
                            readOnly: false,
                        },
                    ],
                    sqlFileOrder: ["schema.sql", "query.sql"],
                    tests: null,
                    files: null,
                    semanticChecks: null,
                    datasetId: "ddl_blank",
                    checkSql: "SELECT name FROM sqlite_master;",
                },
            ],
        } as any);

        const exercise = draft.quizDraft[0];
        expect(exercise.kind).toBe("code_input");
        if (exercise.kind !== "code_input") return;

        expect(exercise.entryFilePath).toBe("query.sql");
        expect(exercise.sqlFileOrder).toEqual(["schema.sql", "query.sql"]);
        expect(exercise.starterCode).toBe("SELECT name FROM sqlite_master;");
        expect(exercise.solutionCode).toBe("SELECT name, sql FROM sqlite_master;");
        expect(exercise.starterCode).not.toContain("stale scalar starter");
        expect(exercise.solutionCode).not.toContain("stale scalar solution");
        expect(exercise.solutionFiles?.map((file) => file.path)).toEqual([
            "schema.sql",
            "query.sql",
        ]);
    });

    it("derives schema, seed, query order when the model omits sqlFileOrder", () => {
        const draft = sanitizeGeneratedTopicAuthoringDraft({
            title: "Prepare a database",
            summary: "Create, seed, and inspect a database.",
            minutes: 25,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "sql-files-derived-order",
                    kind: "code_input",
                    title: "Prepare and inspect",
                    prompt: "Use the provided SQL workspace.",
                    hint: "Run schema before seed and query.",
                    help: {
                        concept: "Ordered SQL files",
                        hint_1: "Create tables first.",
                        hint_2: "Verify after seeding.",
                    },
                    starterCode: null,
                    solutionCode: null,
                    recipeType: "sql_query",
                    entryFilePath: "query.sql",
                    starterFiles: [
                        {
                            path: "query.sql",
                            content: "SELECT name FROM sqlite_master;",
                            language: "sql",
                            isEntry: true,
                        },
                        {
                            path: "seed.sql",
                            content: "-- Add rows here",
                            language: "sql",
                        },
                        {
                            path: "schema.sql",
                            content: "-- Create tables here",
                            language: "sql",
                        },
                    ],
                    solutionFiles: [
                        {
                            path: "query.sql",
                            content: "SELECT name FROM sqlite_master;",
                            language: "sql",
                            isEntry: true,
                        },
                        {
                            path: "seed.sql",
                            content: "INSERT INTO warehouses VALUES (1, 'North');",
                            language: "sql",
                        },
                        {
                            path: "schema.sql",
                            content:
                                "CREATE TABLE warehouses (id INTEGER PRIMARY KEY, name TEXT);",
                            language: "sql",
                        },
                    ],
                    sqlFileOrder: null,
                    tests: null,
                    files: null,
                    semanticChecks: null,
                    datasetId: "ddl_blank",
                    checkSql: "SELECT name FROM sqlite_master;",
                },
            ],
        } as any);

        const exercise = draft.quizDraft[0];
        expect(exercise.kind).toBe("code_input");
        if (exercise.kind !== "code_input") return;

        expect(exercise.sqlFileOrder).toEqual([
            "schema.sql",
            "seed.sql",
            "query.sql",
        ]);
        expect(exercise.entryFilePath).toBe("query.sql");
        expect(exercise.starterCode).toBe(
            "SELECT name FROM sqlite_master;",
        );
    });
});
