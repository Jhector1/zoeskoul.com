import { describe, expect, it } from "vitest";
import { resolveExerciseRuntimeDefaultsLayers } from "./ExerciseRenderer";

describe("resolveExerciseRuntimeDefaultsLayers", () => {
    it("falls back to parent module defaults when exercise does not define them", () => {
        const layers = resolveExerciseRuntimeDefaultsLayers({
            exercise: {
                kind: "code_input",
                id: "ex-1",
                topic: "sql.topic",
                difficulty: "easy",
                title: "SQL",
                prompt: "Prompt",
                language: "sql",
            } as any,
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
            },
        });

        expect(layers.moduleRuntimeDefaults).toMatchObject({
            datasetId: "students_intro",
            showErd: true,
        });
    });

    it("keeps exercise topic defaults over parent topic defaults", () => {
        const layers = resolveExerciseRuntimeDefaultsLayers({
            exercise: {
                kind: "code_input",
                id: "ex-1",
                topic: "sql.topic",
                difficulty: "easy",
                title: "SQL",
                prompt: "Prompt",
                language: "sql",
                topicRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                },
            } as any,
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(layers.topicRuntimeDefaults).toMatchObject({
            datasetId: "products_catalog",
        });
    });
});
