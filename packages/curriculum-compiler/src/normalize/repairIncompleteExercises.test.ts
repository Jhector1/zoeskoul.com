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


    it("removes code_input tests with empty stdout after profile repair", async () => {
        const draft = {
            title: "Scope and local variables",
            summary: "Practice local variables inside functions.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "try-it-yourself",
                    title: "Try it yourself",
                    bodyMarkdown:
                        "Try it yourself: change one value, predict the output, then run the code to check.",
                },
            ],
            quizDraft: [
                {
                    id: "q1",
                    kind: "code_input",
                    title: "Local variable output",
                    prompt: "Complete the program so it prints the local value.",
                    hint: "Use a variable inside the function.",
                    help: {
                        concept:
                            "A local variable exists inside the function where it is created.",
                        hint_1: "Create the value inside the function.",
                        hint_2: "Print the value after assigning it.",
                    },
                    starterCode: "def show_value():\n    value = 3\n    # print value here\n\nshow_value()\n",
                    solutionCode: "def show_value():\n    value = 3\n    print(value)\n\nshow_value()\n",
                    recipeType: "fixed_tests",
                    tests: [
                        {
                            stdin: "",
                            stdout: "",
                            match: "exact",
                        },
                        {
                            stdin: "",
                            stdout: "3\n",
                            match: "exact",
                        },
                    ],
                },
            ],
        } as any;

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                topicId: "scope-and-local-variables",
                profileId: "python",
            } as any,
            draft,
        });

        const exercise = repaired.quizDraft[0] as any;

        expect(exercise.tests).toEqual([
            {
                stdin: "",
                stdout: "3\n",
                match: "exact",
            },
        ]);
    });
    it("synthesizes fallback tests when fixed_tests only had empty stdout tests", async () => {
        const draft = {
            title: "Reading text files",
            summary: "Practice reading text from a file.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "try-it-yourself",
                    title: "Try it yourself",
                    bodyMarkdown:
                        "Try it yourself: change one value, predict the output, then run the code to check.",
                },
            ],
            quizDraft: [
                {
                    id: "q1",
                    kind: "code_input",
                    title: "Read a text file",
                    prompt: "Complete the program.",
                    hint: "Read from the file and print the result.",
                    help: {
                        concept: "Python can read text from files using open().",
                        hint_1: "Open the file before reading it.",
                        hint_2: "Print the value you read.",
                    },
                    starterCode: "print('replace me')\n",
                    solutionCode: "print(13)\n",
                    recipeType: "fixed_tests",
                    tests: [
                        {
                            stdin: "",
                            stdout: "",
                            match: "exact",
                        },
                    ],
                },
            ],
        } as any;

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                topicId: "reading-text-files",
                profileId: "python",
            } as any,
            draft,
        });

        const exercise = repaired.quizDraft[0] as any;

        expect(exercise.recipeType).toBe("fixed_tests");
        expect(exercise.tests).toBeDefined();
        expect(exercise.tests.length).toBeGreaterThan(0);
        expect(
            exercise.tests.every((test: any) => test.stdout.trim().length > 0),
        ).toBe(true);
    });
    it("removes empty-stdout code_input tests and keeps valid tests", async () => {
        const draft = {
            title: "Scope and local variables",
            summary: "Practice local variables.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "try-it-yourself",
                    title: "Try it yourself",
                    bodyMarkdown:
                        "Try it yourself: change one value, predict the output, then run the code to check.",
                },
            ],
            quizDraft: [
                {
                    id: "quiz1",
                    kind: "code_input",
                    title: "Print a local value",
                    prompt: "Complete the program.",
                    hint: "Print the value.",
                    help: {
                        concept: "A local variable exists inside its function.",
                        hint_1: "Assign the value.",
                        hint_2: "Print it.",
                    },
                    starterCode: "def show():\n    value = 3\n    # print value\n\nshow()\n",
                    solutionCode: "def show():\n    value = 3\n    print(value)\n\nshow()\n",
                    recipeType: "fixed_tests",
                    tests: [
                        {
                            stdin: "",
                            stdout: "",
                            match: "exact",
                        },
                        {
                            stdin: "",
                            stdout: "3\n",
                            match: "exact",
                        },
                    ],
                },
            ],
        } as any;

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                topicId: "scope-and-local-variables",
                profileId: "python",
            } as any,
            draft,
        });

        const exercise = repaired.quizDraft[0] as any;

        expect(exercise.recipeType).toBe("fixed_tests");
        expect(exercise.tests).toEqual([
            {
                stdin: "",
                stdout: "3\n",
                match: "exact",
            },
        ]);
    });

    it("does not preserve fixed_tests when no valid tests remain before profile repair", async () => {
        const draft = {
            title: "Scope and local variables",
            summary: "Practice local variables.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "try-it-yourself",
                    title: "Try it yourself",
                    bodyMarkdown:
                        "Try it yourself: change one value, predict the output, then run the code to check.",
                },
            ],
            quizDraft: [
                {
                    id: "quiz1",
                    kind: "code_input",
                    title: "Print a local value",
                    prompt: "Complete the program.",
                    hint: "Print the value.",
                    help: {
                        concept: "A local variable exists inside its function.",
                        hint_1: "Assign the value.",
                        hint_2: "Print it.",
                    },
                    starterCode: "def show():\n    value = 3\n    # print value\n\nshow()\n",
                    solutionCode: "def show():\n    value = 3\n    print(value)\n\nshow()\n",
                    recipeType: "fixed_tests",
                    tests: [
                        {
                            stdin: "",
                            stdout: "",
                            match: "exact",
                        },
                    ],
                },
            ],
        } as any;

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                topicId: "scope-and-local-variables",
                profileId: "python",
            } as any,
            draft,
        });

        const exercise = repaired.quizDraft[0] as any;

        expect(exercise.recipeType === "fixed_tests").toBe(
            Array.isArray(exercise.tests) && exercise.tests.length > 0,
        );
    });
    it("synthesizes valid fallback code_input tests when every authored test has empty stdout", async () => {
        const draft = {
            title: "Scope and local variables",
            summary: "Practice local variables inside functions.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "try-it-yourself",
                    title: "Try it yourself",
                    bodyMarkdown:
                        "Try it yourself: change one value, predict the output, then run the code to check.",
                },
            ],
            quizDraft: [
                {
                    id: "quiz1",
                    kind: "code_input",
                    title: "Local variable output",
                    prompt: "Complete the program so it prints the local value.",
                    hint: "Use a variable inside the function.",
                    help: {
                        concept:
                            "A local variable exists inside the function where it is created.",
                        hint_1: "Create the value inside the function.",
                        hint_2: "Print the value after assigning it.",
                    },
                    starterCode:
                        "number = int(input())\n# Print the next number\n",
                    solutionCode:
                        "number = int(input())\nprint(number + 1)\n",
                    recipeType: "fixed_tests",
                    tests: [
                        {
                            stdin: "",
                            stdout: "",
                            match: "exact",
                        },
                    ],
                },
            ],
        } as any;

        const repaired = await repairIncompleteExercises({
            provider: {} as any,
            seed: {
                topicId: "scope-and-local-variables",
                profileId: "python",
            } as any,
            draft,
        });

        const exercise = repaired.quizDraft[0] as any;

        expect(exercise.recipeType).toBe("fixed_tests");
        expect(Array.isArray(exercise.tests)).toBe(true);
        expect(exercise.tests.length).toBeGreaterThan(0);

        for (const test of exercise.tests) {
            expect(typeof test.stdout).toBe("string");
            expect(test.stdout.trim().length).toBeGreaterThan(0);
        }
    });
});
