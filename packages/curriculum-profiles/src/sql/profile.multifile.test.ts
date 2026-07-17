import { describe, expect, it } from "vitest";
import { sqlProfile } from "./profile.js";

function makeSeed(overrides: Record<string, unknown> = {}) {
    return {
        subjectSlug: "sql",
        courseSlug: "sql-data-management",
        profileId: "sql",
        moduleSlug: "sql-data-management-module-2-table-creation-constraints",
        modulePrefix: "sql_data_management_2",
        moduleNumber: 2,
        moduleOrder: 3,
        sectionSlug: "sql-data-management-section-2-schema",
        sectionOrder: 1,
        topicId: "create-table",
        order: 1,
        title: "Create a Table",
        summary: "Create and inspect a table.",
        minutes: 20,
        sourceLocale: "en",
        targetLocales: [],
        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "ddl_blank",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsTerminal: false,
        },
        ...overrides,
    } as any;
}

function makeExercise() {
    return {
        id: "create-warehouse",
        kind: "code_input" as const,
        title: "Create a warehouse table",
        prompt: "Define the table in schema.sql and inspect it in query.sql.",
        hint: "Keep schema creation separate from verification.",
        help: {
            concept: "An ordered SQL workspace executes schema definitions before verification queries.",
            hint_1: "Put CREATE TABLE in schema.sql.",
            hint_2: "Inspect sqlite_master in query.sql.",
        },
        recipeType: "sql_query" as const,
        datasetId: "ddl_blank",
        entryFilePath: "query.sql",
        starterCode: "SELECT name FROM sqlite_master WHERE type = 'table';",
        solutionCode:
            "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'warehouses';",
        sqlFileOrder: ["schema.sql", "query.sql"],
        starterFiles: [
            { path: "schema.sql", content: "-- Define warehouses here.\n" },
            {
                path: "query.sql",
                content: "SELECT name FROM sqlite_master WHERE type = 'table';",
                isEntry: true,
            },
        ],
        solutionFiles: [
            {
                path: "schema.sql",
                content: "CREATE TABLE warehouses (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
            },
            {
                path: "query.sql",
                content:
                    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'warehouses';",
                isEntry: true,
            },
        ],
        checkSql:
            "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'warehouses';",
    };
}

describe("SQL profile ordered multi-file workspaces", () => {
    it("tells authoring to emit the exact module file architecture", () => {
        const rules = sqlProfile.renderExerciseKindPromptRules?.({
            mode: "authoring",
            seed: makeSeed(),
        }).join("\n");

        expect(rules).toContain("schema.sql, query.sql");
        expect(rules).toContain(
            "entryFilePath to the one file the learner changes",
        );
        expect(rules).toContain(
            "Use schema.sql as entryFilePath",
        );
        expect(rules).toContain(
            "Never provide the completed target table",
        );
        expect(rules).toContain(
            "foreign-key lesson may provide completed parent tables",
        );
        expect(rules).toContain('["schema.sql","query.sql"]');
        expect(rules).toContain("complete workspace snapshot");
    });

    it("compiles solutionFiles into one deterministic graded SQL program", () => {
        const manifest = sqlProfile.codeInput!.buildManifest({
            exercise: makeExercise(),
            seed: makeSeed(),
            messageBase: "topics.sql.create_warehouse.practice.create_warehouse",
        });

        expect(manifest.runtime).toMatchObject({
            kind: "sql",
            supportsMultiFile: true,
            supportsFileSystem: true,
        });
        expect(manifest.workspace).toMatchObject({
            entryFilePath: "query.sql",
            openTabs: ["schema.sql", "query.sql"],
        });
        expect(manifest.recipe).toMatchObject({
            type: "sql_query",
            sqlFileOrder: ["schema.sql", "query.sql"],
        });
        expect(manifest.recipe.type === "sql_query" && manifest.recipe.solutionCode).toContain(
            "-- file: schema.sql\nCREATE TABLE warehouses",
        );
        expect(manifest.recipe.type === "sql_query" && manifest.recipe.solutionCode).toContain(
            "-- file: query.sql\nSELECT name, sql",
        );
    });

    it("allows schema.sql to be the active file for a schema-building step", () => {
        const exercise = makeExercise();
        const schemaStarter =
            exercise.starterFiles.find(
                (file) => file.path === "schema.sql",
            )!.content;
        const schemaSolution =
            exercise.solutionFiles.find(
                (file) => file.path === "schema.sql",
            )!.content;

        const manifest = sqlProfile.codeInput!.buildManifest({
            exercise: {
                ...exercise,
                entryFilePath: "schema.sql",
                starterCode: schemaStarter,
                solutionCode: schemaSolution,
                starterFiles: exercise.starterFiles.map(
                    (file) => ({
                        ...file,
                        isEntry: file.path === "schema.sql",
                        entry: file.path === "schema.sql",
                    }),
                ),
                solutionFiles: exercise.solutionFiles.map(
                    (file) => ({
                        ...file,
                        isEntry: file.path === "schema.sql",
                        entry: file.path === "schema.sql",
                    }),
                ),
            },
            seed: makeSeed(),
            messageBase:
                "topics.sql.create_warehouse.practice.create_warehouse",
        });

        expect(manifest.workspace).toMatchObject({
            entryFilePath: "schema.sql",
            openTabs: ["schema.sql", "query.sql"],
        });
        expect(
            sqlProfile.resolveExpectedEntryFileName?.({
                seed: makeSeed(),
                exercise: manifest,
            }),
        ).toBe("schema.sql");
        expect(
            manifest.recipe.type === "sql_query" &&
                manifest.recipe.solutionCode,
        ).toContain(
            "-- file: schema.sql\nCREATE TABLE warehouses",
        );
    });

    it("rejects authored multi-file SQL in a single-file runtime", () => {
        expect(() =>
            sqlProfile.codeInput!.buildManifest({
                exercise: makeExercise(),
                seed: makeSeed({
                    moduleRuntimeDefaults: {
                        kind: "sql",
                        datasetId: "ddl_blank",
                        fixedSqlDialect: "sqlite",
                        resultShape: "table",
                        supportsMultiFile: false,
                        supportsFileSystem: false,
                    },
                }),
                messageBase: "topics.sql.create_warehouse.practice.create_warehouse",
            }),
        ).toThrow(/supportsMultiFile=true/);
    });
    it("keeps SQL Data Management Modules 0-1 on one query.sql file", () => {
        const exercise = makeExercise();
        const manifest = sqlProfile.codeInput!.buildManifest({
            exercise: {
                ...exercise,
                entryFilePath: undefined,
                starterFiles: undefined,
                solutionFiles: undefined,
                sqlFileOrder: undefined,
                starterCode: "SELECT id FROM inventory_items WHERE id = 7;",
                solutionCode: [
                    "SELECT id, quantity FROM inventory_items WHERE id = 7;",
                    "UPDATE inventory_items SET quantity = 25 WHERE id = 7;",
                    "SELECT id, quantity FROM inventory_items WHERE id = 7;",
                ].join("\n"),
                checkSql: "SELECT id, quantity FROM inventory_items WHERE id = 7;",
                datasetId: "inventory_ops",
            },
            seed: makeSeed({
                moduleNumber: 1,
                moduleOrder: 2,
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "inventory_ops",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                    supportsMultiFile: false,
                    supportsFileSystem: false,
                    supportsTerminal: false,
                },
            }),
            messageBase: "topics.sql.inventory.practice.correct_quantity",
        });

        expect(manifest.workspace).toMatchObject({
            entryFilePath: "query.sql",
            openTabs: ["query.sql"],
        });
        expect(manifest.runtime).toMatchObject({
            supportsMultiFile: false,
            supportsFileSystem: false,
        });
        expect(manifest.recipe).not.toHaveProperty("sqlFileOrder");
    });

    it("does not impose Data Management file names on other SQL courses", () => {
        const rules = sqlProfile.renderExerciseKindPromptRules?.({
            mode: "authoring",
            seed: makeSeed({
                courseSlug: "multi-table-sql",
                moduleNumber: 2,
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "school_relations_intro",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                    supportsMultiFile: false,
                    supportsFileSystem: false,
                    supportsTerminal: false,
                },
            }),
        }).join("\n");

        expect(rules).not.toContain("schema.sql, query.sql");
        expect(rules).not.toContain("exactly one learner-editable file named query.sql");
        expect(rules).toContain("complete cumulative SQL script");
    });

});
