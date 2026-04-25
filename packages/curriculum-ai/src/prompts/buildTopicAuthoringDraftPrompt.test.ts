
import { describe, expect, it } from "vitest";
import { buildTopicAuthoringDraftPrompt } from "./buildTopicAuthoringDraftPrompt.js";

describe("buildTopicAuthoringDraftPrompt", () => {
    it("includes planned exercise counts from the seed", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                exercisePolicy: {
                    source: "module_spec",
                    mix: {
                        single_choice: 0.2,
                        multi_choice: 0.2,
                        drag_reorder: 0.1,
                        fill_blank_choice: 0.3,
                        code_input: 0.2,
                    },
                },
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "fill_blank_choice",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 2,
                        code_input: 1,
                    },
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Required exercise counts");
        expect(prompt.system).toContain("fill_blank_choice: 2");
    });

    it("includes sql dataset rules for sql profile seeds", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("If profileId is sql:");
        expect(prompt.system).toContain('code_input recipeType must be "sql_query"');
    });
});