import { describe, expect, it } from "vitest";
import { critiquePythonDraft } from "./critiquePythonDraft.js";
import { repairPythonDraft } from "../repair/repairPythonDraft.js";

describe("critiquePythonDraft", () => {
    it("rejects unresolved no-stdin one-test fixed_tests before manifest build", async () => {
        const result = await critiquePythonDraft({
            seed: {
                topicId: "running-python-code",
                profileId: "python",
            } as any,
            draft: {
                title: "Running Python Code",
                summary: "Intro topic",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "quiz5",
                        kind: "code_input",
                        title: "Simple Print Program",
                        prompt: "Print Welcome to Python programming!",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print(\"Welcome to Python programming!\")\n",
                        recipeType: "fixed_tests",
                        tests: [
                            {
                                stdout: "Welcome to Python programming!\n",
                                match: "exact",
                            },
                        ],
                        hint: "Use print.",
                        help: {
                            concept: "print displays text.",
                            hint_1: "Put the text in quotes.",
                            hint_2: "Print the exact message once.",
                        },
                    },
                ],
            } as any,
        });

        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
                    severity: "error",
                    exerciseId: "quiz5",
                }),
            ]),
        );
    });

    it("does not flag converted static-output exercises as unresolved fixed_tests", async () => {
        const repaired = await repairPythonDraft({
            seed: {
                topicId: "running-python-code",
                profileId: "python",
                technical: true,
            } as any,
            draft: {
                title: "Running Python Code",
                summary: "Intro topic",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "quiz5",
                        kind: "code_input",
                        title: "Simple Print Program",
                        prompt: "Print Welcome to Python programming!",
                        starterCode: "# Write your code below\n",
                        solutionCode: "print(\"Welcome to Python programming!\")\n",
                        recipeType: "fixed_tests",
                        tests: [
                            {
                                stdout: "Welcome to Python programming!\n",
                                match: "exact",
                            },
                        ],
                        hint: "Use print.",
                        help: {
                            concept: "print displays text.",
                            hint_1: "Put the text in quotes.",
                            hint_2: "Print the exact message once.",
                        },
                    },
                ],
            } as any,
        });

        const critique = await critiquePythonDraft({
            seed: {
                topicId: "running-python-code",
                profileId: "python",
            } as any,
            draft: repaired.draft,
        });

        expect(critique.ok).toBe(true);
        expect(critique.issues).toEqual([]);
    });
});
