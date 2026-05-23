import { describe, expect, it } from "vitest";
import { resolveSqlRunnerConfig } from "./resolveSqlRunnerConfig";

describe("resolveSqlRunnerConfig", () => {
    it("inherits dataset snapshots from module runtime defaults", () => {
        const resolved = resolveSqlRunnerConfig({
            language: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
                showChen: true,
            },
        });

        expect(resolved.isSql).toBe(true);
        expect(resolved.sqlDatasetId).toBe("students_intro");
        expect(Object.keys(resolved.sqlInitialTableSnapshots ?? {})).toContain("students");
        expect(resolved.sqlPaneOptions).toMatchObject({
            showTables: true,
            showErd: true,
            showChen: true,
            defaultTab: "tables",
        });
    });

    it("inherits dataset snapshots from topic runtime defaults", () => {
        const resolved = resolveSqlRunnerConfig({
            language: "sql",
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "products_catalog",
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.sqlDatasetId).toBe("products_catalog");
        expect(Object.keys(resolved.sqlInitialTableSnapshots ?? {})).toContain("products");
    });

    it("lets recipe dataset override topic and module defaults", () => {
        const resolved = resolveSqlRunnerConfig({
            language: "sql",
            recipe: {
                type: "sql_query",
                datasetId: "customers_cleanup",
            },
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "products_catalog",
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.sqlDatasetId).toBe("customers_cleanup");
        expect(Object.keys(resolved.sqlInitialTableSnapshots ?? {})).toContain("customers");
    });

    it("uses the full UI precedence chain for dataset resolution", () => {
        const resolved = resolveSqlRunnerConfig({
            language: "sql",
            exerciseRuntime: {
                kind: "sql",
                datasetId: "sales_kpi",
                showErd: false,
            },
            exerciseSqlDatasetId: "exercise_level",
            recipe: {
                type: "sql_query",
                datasetId: "customers_cleanup",
            },
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "products_catalog",
                showErd: true,
                showChen: true,
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
                showChen: false,
            },
        });

        expect(resolved.sqlDatasetId).toBe("sales_kpi");
        expect(resolved.sqlPaneOptions).toMatchObject({
            showErd: false,
            showChen: true,
        });
    });
});
