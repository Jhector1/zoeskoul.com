import { describe, expect, it } from "vitest";
import { buildExerciseRepairPrompt } from "./buildExerciseRepairPrompt.js";

describe("buildExerciseRepairPrompt", () => {
    it("uses the shared exercise kind contract in generic-to-specific order", () => {
        const prompt = buildExerciseRepairPrompt({
            seed: {
                profileId: "python",
            } as any,
            exercise: {
                id: "ex-1",
                kind: "code_input",
            },
        });

        expect(prompt.system).toContain("Exercise-kind contract (generic to specific):");
        expect(prompt.system).toContain(
            "single_choice: course-agnostic knowledge check with exactly one correct answer.",
        );
        expect(prompt.system).toContain(
            'If profileId is not sql, prefer code_input recipeType "fixed_tests".',
        );
        expect(prompt.system).toContain(
            "Preserve the same exercise kind during repair; only repair structure, correctness, and profile/runtime compatibility.",
        );
    });
});
