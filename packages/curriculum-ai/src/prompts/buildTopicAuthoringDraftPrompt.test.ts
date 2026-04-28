
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

    it("includes fixed test guidance for non-sql code_input exercises", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain('prefer code_input recipeType "fixed_tests"');
        expect(prompt.system).toContain(
            "include a tests array with one or more real stdin/stdout cases.",
        );
    });

    it("renders exercise kind rules from a shared generic-to-specific contract", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Exercise-kind contract (generic to specific):");
        expect(prompt.system).toContain(
            "single_choice: course-agnostic knowledge check with exactly one correct answer.",
        );
        expect(prompt.system).toContain(
            "multi_choice: course-agnostic knowledge check with two or more genuinely correct answers when appropriate.",
        );
        expect(prompt.system).toContain(
            "code_input: implementation exercise whose runtime/recipe details may vary by profile, language, and execution model.",
        );
    });

    it("includes teaching-quality guidance for sketches and programming examples", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "python",
                exercisePolicy: undefined,
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain("Teaching-quality rules for sketchBlocks in every subject:");
        expect(prompt.system).toContain("Include at least one concrete worked example");
        expect(prompt.system).toContain("Extra teaching rules for programming-family profiles:");
        expect(prompt.system).toContain("explain it step by step or line by line");
        expect(prompt.system).toContain("Include a small 'Try it yourself' follow-up");
    });
});
