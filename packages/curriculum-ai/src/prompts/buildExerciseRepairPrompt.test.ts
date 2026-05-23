import { afterEach, describe, expect, it } from "vitest";
import {
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { buildExerciseRepairPrompt } from "./buildExerciseRepairPrompt.js";

afterEach(() => {
    unregisterCurriculumProfile("testlang");
});

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
            'For Python code_input, prefer recipeType "fixed_tests" when the exercise is a normal runnable program.',
        );
        expect(prompt.system).toContain(
            "Preserve the same exercise kind during repair; only repair structure, correctness, and profile/runtime compatibility.",
        );
    });

    it("keeps generic repair prompts free of Python rules when the active profile does not define them", () => {
        const testlangProfile: CourseProfile = {
            id: "testlang",
            shape: {
                ...pythonShape,
                profileId: "testlang",
            },
            allowedExerciseKinds: ["code_input"],
            allowedRecipeTypes: ["fixed_tests"],
            buildModuleRuntimeDefaults() {
                return { kind: "code", language: "testlang" };
            },
            codeInput: {
                defaultStarter() {
                    return "// Write your testlang answer below\n";
                },
                defaultRecipeType() {
                    return "fixed_tests";
                },
                buildManifest() {
                    throw new Error("Not needed");
                },
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };

        registerCurriculumProfile(testlangProfile);

        const prompt = buildExerciseRepairPrompt({
            seed: {
                profileId: "testlang",
            } as any,
            exercise: {
                id: "ex-1",
                kind: "code_input",
            },
        });

        expect(prompt.system).not.toContain("For Python code_input");
        expect(prompt.system).not.toContain('recipeType must be "sql_query"');
    });
});
