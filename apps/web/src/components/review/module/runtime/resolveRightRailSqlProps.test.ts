import { describe, expect, it } from "vitest";

import {
    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
    STUDENTS_SQL_SCHEMA,
    STUDENTS_SQL_SEED,
} from "../data/studentsSqlFallback";

import {
    resolveRightRailSqlProps,
    type SqlInitialTableSnapshots,
} from "./resolveRightRailSqlProps";

function tableSnapshot(
    name: string,
    columns: Array<{ name: string; type?: string | null }>,
    rows: unknown[][],
): SqlInitialTableSnapshots {
    return {
        [name]: {
            name,
            columns,
            rows,
            rowCount: rows.length,
        },
    };
}

describe("resolveRightRailSqlProps", () => {
    it("keeps module/topic SQL fallback available when the route is not exercise-bound", () => {
        const snapshots = tableSnapshot(
            "products",
            [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
            ],
            [[1, "Sketchbook", "Art"]],
        );

        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
                toolSqlDatasetId: null,
                toolSqlSchemaSql: null,
                toolSqlSeedSql: null,
                toolSqlInitialTableSnapshots: undefined,
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "products_catalog",
                sqlSchemaSql:
                    "CREATE TABLE products (id INTEGER, name TEXT, category TEXT);",
                sqlSeedSql: "INSERT INTO products VALUES (1, 'Sketchbook', 'Art');",
                sqlInitialTableSnapshots: snapshots,
                sqlPaneOptions: {
                    showTables: true,
                    showErd: true,
                    showChen: false,
                    defaultTab: "tables",
                },
            },
        });

        expect(props).toMatchObject({
            toolSqlDialect: "sqlite",
            sqlResultShape: "table",
            sqlDatasetId: "products_catalog",
            sqlSchemaSql:
                "CREATE TABLE products (id INTEGER, name TEXT, category TEXT);",
            sqlSeedSql: "INSERT INTO products VALUES (1, 'Sketchbook', 'Art');",
            sqlInitialTableSnapshots: snapshots,
            sqlPaneOptions: {
                showTables: true,
                showErd: true,
                showChen: false,
                defaultTab: "tables",
            },
            defaultSurface: "results",
        });
    });

    it("lets an exercise-bound SQL dataset override topic/module fallback", () => {
        const fallbackSnapshots = tableSnapshot(
            "products",
            [{ name: "id", type: "INTEGER" }],
            [[1]],
        );

        const exerciseSnapshots = tableSnapshot(
            "orders",
            [
                { name: "id", type: "INTEGER" },
                { name: "total", type: "INTEGER" },
            ],
            [[10, 25]],
        );

        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: true,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
                toolSqlDatasetId: "exercise_orders",
                toolSqlSchemaSql: "CREATE TABLE orders (id INTEGER, total INTEGER);",
                toolSqlSeedSql: "INSERT INTO orders VALUES (10, 25);",
                toolSqlInitialTableSnapshots: exerciseSnapshots,
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "products_catalog",
                sqlSchemaSql: "CREATE TABLE products (id INTEGER);",
                sqlSeedSql: "INSERT INTO products VALUES (1);",
                sqlInitialTableSnapshots: fallbackSnapshots,
            },
        });

        expect(props).toEqual({
            toolSqlDialect: "sqlite",
            sqlResultShape: "table",
            sqlDatasetId: "exercise_orders",
            sqlSchemaSql: "CREATE TABLE orders (id INTEGER, total INTEGER);",
            sqlSeedSql: "INSERT INTO orders VALUES (10, 25);",
            sqlInitialTableSnapshots: exerciseSnapshots,
        });
    });

    it("falls back to topic/module SQL when exercise route exists but exercise SQL fields are blank", () => {
        const snapshots = tableSnapshot(
            "products",
            [
                { name: "id", type: "INTEGER" },
                { name: "category", type: "TEXT" },
            ],
            [[4, "Art"]],
        );

        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: true,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "",
                toolSqlDatasetId: "",
                toolSqlSchemaSql: "   ",
                toolSqlSeedSql: "",
                toolSqlInitialTableSnapshots: undefined,
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "products_catalog",
                sqlSchemaSql: "CREATE TABLE products (id INTEGER, category TEXT);",
                sqlSeedSql: "INSERT INTO products VALUES (4, 'Art');",
                sqlInitialTableSnapshots: snapshots,
            },
        });

        expect(props.toolSqlDialect).toBe("sqlite");
        expect(props.sqlResultShape).toBe("table");
        expect(props.sqlDatasetId).toBe("products_catalog");
        expect(props.sqlSchemaSql).toBe(
            "CREATE TABLE products (id INTEGER, category TEXT);",
        );
        expect(props.sqlSeedSql).toBe("INSERT INTO products VALUES (4, 'Art');");
        expect(props.sqlInitialTableSnapshots).toBe(snapshots);
    });

    it("does not expose SQL dataset/result shape when neither tool nor runtime has SQL", () => {
        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: {
                toolLang: "python",
                toolSqlDialect: undefined,
                toolSqlDatasetId: undefined,
                toolSqlSchemaSql: undefined,
                toolSqlSeedSql: undefined,
                toolSqlInitialTableSnapshots: undefined,
            },
            topicSqlFallback: null,
        });

        expect(props.toolSqlDialect).toBe("sqlite");
        expect(props.sqlResultShape).toBeUndefined();
        expect(props.sqlDatasetId).toBeUndefined();

        // Existing non-SQL generic fallback behavior stays preserved.
        expect(props.sqlSchemaSql).toBe(STUDENTS_SQL_SCHEMA);
        expect(props.sqlSeedSql).toBe(STUDENTS_SQL_SEED);
        expect(props.sqlInitialTableSnapshots).toBe(STUDENTS_INITIAL_TABLE_SNAPSHOTS);
    });

    it("does not inject students fallback schema/seed over a plain SQL editor with no dataset", () => {
        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
                toolSqlDatasetId: undefined,
                toolSqlSchemaSql: undefined,
                toolSqlSeedSql: undefined,
                toolSqlInitialTableSnapshots: undefined,
            },
            topicSqlFallback: null,
        });

        expect(props.toolSqlDialect).toBe("sqlite");
        expect(props.sqlResultShape).toBe("table");
        expect(props.sqlDatasetId).toBeUndefined();
        expect(props.sqlSchemaSql).toBeUndefined();
        expect(props.sqlSeedSql).toBeUndefined();
        expect(props.sqlInitialTableSnapshots).toBeUndefined();
    });

    it("prefers exercise-bound SQL props over runtime fallback props", () => {
        const fallbackSnapshots = tableSnapshot(
            "products",
            [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
            ],
            [[1, "Sketchbook"]],
        );

        const exerciseSnapshots = tableSnapshot(
            "orders",
            [
                { name: "id", type: "INTEGER" },
                { name: "total", type: "INTEGER" },
            ],
            [[10, 25]],
        );

        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: true,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
                toolSqlDatasetId: "exercise_orders",
                toolSqlSchemaSql: "CREATE TABLE orders (id INTEGER, total INTEGER);",
                toolSqlSeedSql: "INSERT INTO orders VALUES (10, 25);",
                toolSqlInitialTableSnapshots: exerciseSnapshots,
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "products_catalog",
                sqlSchemaSql: "CREATE TABLE products (id INTEGER, name TEXT);",
                sqlSeedSql: "INSERT INTO products VALUES (1, 'Sketchbook');",
                sqlInitialTableSnapshots: fallbackSnapshots,
            },
        });

        expect(props.toolSqlDialect).toBe("sqlite");
        expect(props.sqlResultShape).toBe("table");
        expect(props.sqlDatasetId).toBe("exercise_orders");
        expect(props.sqlSchemaSql).toBe(
            "CREATE TABLE orders (id INTEGER, total INTEGER);",
        );
        expect(props.sqlSeedSql).toBe("INSERT INTO orders VALUES (10, 25);");
        expect(props.sqlInitialTableSnapshots).toBe(exerciseSnapshots);
    });

    it("falls back to runtime SQL defaults when exercise-bound SQL fields are blank", () => {
        const fallbackSnapshots = tableSnapshot(
            "products",
            [
                { name: "id", type: "INTEGER" },
                { name: "name", type: "TEXT" },
                { name: "category", type: "TEXT" },
            ],
            [[1, "Sketchbook", "Art"]],
        );

        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: true,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "",
                toolSqlDatasetId: "",
                toolSqlSchemaSql: "   ",
                toolSqlSeedSql: "",
                toolSqlInitialTableSnapshots: undefined,
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "products_catalog",
                sqlSchemaSql:
                    "CREATE TABLE products (id INTEGER, name TEXT, category TEXT);",
                sqlSeedSql: "INSERT INTO products VALUES (1, 'Sketchbook', 'Art');",
                sqlInitialTableSnapshots: fallbackSnapshots,
            },
        });

        expect(props.toolSqlDialect).toBe("sqlite");
        expect(props.sqlResultShape).toBe("table");
        expect(props.sqlDatasetId).toBe("products_catalog");
        expect(props.sqlSchemaSql).toBe(
            "CREATE TABLE products (id INTEGER, name TEXT, category TEXT);",
        );
        expect(props.sqlSeedSql).toBe(
            "INSERT INTO products VALUES (1, 'Sketchbook', 'Art');",
        );
        expect(props.sqlInitialTableSnapshots).toBe(fallbackSnapshots);
    });

    it("merges a card-specific desktop tab with topic SQL visibility", () => {
        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "school_relations_intro",
                sqlPaneOptions: {
                    showResults: true,
                    showTables: true,
                    showErd: true,
                    showChen: false,
                    defaultTab: "tables",
                },
            },
            cardSqlPaneOptions: {
                defaultTab: "erd",
                compactDefaultTab: "results",
            },
            compactLayout: false,
        });

        expect(props.sqlPaneOptions).toEqual({
            showResults: true,
            showTables: true,
            showErd: true,
            showChen: false,
            defaultTab: "erd",
            compactDefaultTab: "results",
        });
    });

    it("defaults compact SQL layouts to Results without hiding Tables or ERD", () => {
        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "school_relations_intro",
                sqlPaneOptions: {
                    showResults: true,
                    showTables: true,
                    showErd: true,
                    defaultTab: "tables",
                },
            },
            cardSqlPaneOptions: {
                defaultTab: "erd",
                compactDefaultTab: "results",
            },
            compactLayout: true,
        });

        expect(props.sqlPaneOptions).toMatchObject({
            showResults: true,
            showTables: true,
            showErd: true,
            defaultTab: "results",
        });
    });

    it("resolves topic, lesson, and exercise policies by specificity", () => {
        const lesson = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: { toolLang: "sql", toolSqlDialect: "sqlite" },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "school_relations_intro",
            },
            topicTools: {
                defaultSurface: "editor",
                compactDefaultSurface: "results",
                sqlPane: { showTables: true, showErd: true, showChen: false },
            },
            cardTools: {
                defaultSurface: "results",
                sqlPane: { defaultTab: "erd", compactDefaultTab: "results" },
            },
        });

        expect(lesson.defaultSurface).toBe("results");
        expect(lesson.sqlPaneOptions).toMatchObject({
            showTables: true,
            showErd: true,
            showChen: false,
            defaultTab: "erd",
        });

        const exercise = resolveRightRailSqlProps({
            routeCanUseBoundExercise: true,
            tool: {
                toolLang: "sql",
                toolSqlDialect: "sqlite",
                toolPresentation: {
                    defaultSurface: "editor",
                    sqlPane: { defaultTab: "results" },
                },
            },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "school_relations_intro",
            },
            topicTools: lesson.toolPresentation,
            cardTools: { defaultSurface: "results", sqlPane: { defaultTab: "erd" } },
        });

        expect(exercise.defaultSurface).toBe("editor");
        expect(exercise.sqlPaneOptions?.defaultTab).toBe("results");
    });

    it("uses compact defaults without erasing desktop visibility", () => {
        const props = resolveRightRailSqlProps({
            routeCanUseBoundExercise: false,
            tool: { toolLang: "sql", toolSqlDialect: "sqlite" },
            topicSqlFallback: {
                sqlDialect: "sqlite",
                sqlDatasetId: "school_relations_intro",
            },
            topicTools: {
                defaultSurface: "editor",
                compactDefaultSurface: "results",
                sqlPane: {
                    defaultTab: "erd",
                    compactDefaultTab: "results",
                    showTables: true,
                    showErd: true,
                },
            },
            compactLayout: true,
        });

        expect(props.defaultSurface).toBe("results");
        expect(props.sqlPaneOptions).toMatchObject({
            defaultTab: "results",
            showTables: true,
            showErd: true,
        });
    });

});
