
import { describe, expect, it } from "vitest";
import { renderExercisePolicyPrompt } from "./renderExercisePolicyPrompt.js";

describe("renderExercisePolicyPrompt", () => {
    it("does not use the old soft-policy wording when exact counts are present", () => {
        const prompt = renderExercisePolicyPrompt({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.2,
                    multi_choice: 0.2,
                    drag_reorder: 0.1,
                    fill_blank_choice: 0.3,
                    code_input: 0.2,
                },
            },
            plannedCounts: {
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
        } as any);

        const lower = prompt.toLowerCase();

        expect(lower).not.toContain("reflect this mix as closely as practical");
        expect(lower).not.toContain("approximate the mix with the nearest practical counts");
        expect(lower).toContain("do not approximate the mix when exact counts are provided");
    });

    it("does not use the old soft-policy wording when exact counts are present", () => {
        const prompt = renderExercisePolicyPrompt({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.2,
                    multi_choice: 0.2,
                    drag_reorder: 0.1,
                    fill_blank_choice: 0.3,
                    code_input: 0.2,
                },
            },
            plannedCounts: {
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
        } as any);

        const lower = prompt.toLowerCase();

        expect(lower).not.toContain("reflect this mix as closely as practical");
        expect(lower).not.toContain("approximate the mix with the nearest practical counts");
        expect(lower).toContain("do not approximate the mix when exact counts are provided");
    });});