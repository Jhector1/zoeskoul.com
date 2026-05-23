import { afterEach, describe, expect, it, vi } from "vitest";
import {
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";

vi.mock("@zoeskoul/curriculum-ai", () => ({
    repairExercise: vi.fn(async (_provider, { exercise }) => exercise),
}));

import { repairIncompleteExercises } from "./repairIncompleteExercises.js";

afterEach(() => {
    unregisterCurriculumProfile("testlang");
});

describe("repairIncompleteExercises", () => {
    it("fills sql dataset defaults onto code_input exercises", async () => {
        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                profileId: "sql",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "students_intro",
                },
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write a query.",
                        hint: "Start from SELECT.",
                        help: {
                            concept: "You need a SQL query.",
                            hint_1: "Use SELECT.",
                            hint_2: "Return the right rows.",
                        },
                        starterCode: "SELECT * FROM students;",
                        solutionCode: "SELECT * FROM students;",
                        recipeType: "sql_query",
                        datasetId: "",
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.datasetId).toBe("students_intro");
    });

    it("fills missing fill_blank correctValue from the first choice deterministically", async () => {
        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {} as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "fill-1",
                        kind: "fill_blank_choice",
                        title: "Fill",
                        prompt: "Choose a clause.",
                        hint: "Think about filtering.",
                        help: {
                            concept: "Filtering uses a clause.",
                            hint_1: "It comes before the condition.",
                            hint_2: "Choose the clause that filters rows.",
                        },
                        template: "SELECT * FROM users ___ age > 18",
                        choices: ["WHERE", "ORDER BY"],
                        correctValue: "",
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctValue).toBe("WHERE");
    });

    it("uses Python profile repair defaults for runnable code_input exercises", async () => {
        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                profileId: "python",
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Read a number and print the next number.",
                        hint: "Use input.",
                        help: {
                            concept: "Read a value and print a result.",
                            hint_1: "Convert the input first.",
                            hint_2: "Print the final answer.",
                        },
                        starterCode: "# Write your answer below\n",
                        solutionCode: "n = int(input())\nprint(n + 1)",
                        recipeType: undefined,
                        tests: [],
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.recipeType).toBe("fixed_tests");
        expect(exercise.tests).toHaveLength(2);
    });

    it("does not turn a custom profile into Python during repair", async () => {
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
                repairDraft(args: any) {
                    return {
                        ...args.exercise,
                        recipeType: "fixed_tests",
                    };
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

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                profileId: "testlang",
            } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Prompt",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        starterCode: "// Write your testlang answer below\n",
                        solutionCode: "print ok",
                        recipeType: undefined,
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.recipeType).toBe("fixed_tests");
        expect(exercise.tests).toBeUndefined();
    });

    it("fails loudly when a concept-only profile tries to repair code_input", async () => {
        await expect(
            repairIncompleteExercises({
                provider: {} as any,
                seed: {
                    profileId: "math",
                } as any,
                draft: {
                    title: "Topic",
                    summary: "Summary",
                    minutes: 15,
                    sketchBlocks: [],
                    quizDraft: [
                        {
                            id: "code-1",
                            kind: "code_input",
                            title: "Code",
                            prompt: "Prompt",
                            hint: "Hint",
                            help: {
                                concept: "Concept",
                                hint_1: "Hint 1",
                                hint_2: "Hint 2",
                            },
                            starterCode: "custom starter\n",
                            solutionCode: "print ok",
                        },
                    ],
                } as any,
            }),
        ).rejects.toThrow('Profile "math" does not support code_input exercises.');
    });
});
