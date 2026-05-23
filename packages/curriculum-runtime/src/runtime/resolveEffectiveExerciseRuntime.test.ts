import { describe, expect, it } from "vitest";
import { resolveEffectiveExerciseRuntime } from "./resolveEffectiveExerciseRuntime.js";

describe("resolveEffectiveExerciseRuntime", () => {
    it("inherits module dataset when exercise and topic do not set one", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.datasetId).toBe("students_intro");
        expect(resolved.sourceMap?.datasetId).toBe("module.runtimeDefaults");
        expect(resolved.showTables).toBe(true);
    });

    it("lets topic dataset override module dataset", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "customers_cleanup",
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.datasetId).toBe("customers_cleanup");
        expect(resolved.sourceMap?.datasetId).toBe("topic.runtimeDefaults");
    });

    it("lets recipe.datasetId override topic and module defaults", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            recipe: {
                type: "sql_query",
                datasetId: "products_catalog",
            },
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "customers_cleanup",
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.datasetId).toBe("products_catalog");
        expect(resolved.sourceMap?.datasetId).toBe("recipe.datasetId");
    });

    it("lets exercise.runtime.datasetId override recipe and inherited defaults", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            exerciseRuntime: {
                kind: "sql",
                datasetId: "exercise_dataset",
            },
            recipe: {
                type: "sql_query",
                datasetId: "products_catalog",
            },
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "customers_cleanup",
            },
        });

        expect(resolved.datasetId).toBe("exercise_dataset");
        expect(resolved.sourceMap?.datasetId).toBe("exercise.runtime");
    });

    it("inherits showErd from module defaults", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
            },
        });

        expect(resolved.showErd).toBe(true);
    });

    it("lets exercise runtime disable showErd over module defaults", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            exerciseRuntime: {
                kind: "sql",
                showErd: false,
            },
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
            },
        });

        expect(resolved.showErd).toBe(false);
    });

    it("defaults SQL showTables to true when a dataset exists", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.showTables).toBe(true);
    });

    it("defaults SQL showSchema to true when a dataset exists", () => {
        const resolved = resolveEffectiveExerciseRuntime({
            language: "sql",
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(resolved.showSchema).toBe(true);
    });
});
