import { describe, expect, it } from "vitest";
import { repairPythonDraft } from "./repairPythonDraft.js";

describe("repairPythonDraft", () => {
    it("rewrites stock SQL-flavored hints into Python guidance", async () => {
        const result = await repairPythonDraft({
            seed: { topicId: "python-topic" } as any,
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Focus on the SQL task being asked for, not on copying final query text.",
                        help: {
                            concept: "Build the query from the operation the exercise is testing.",
                            hint_1: "Think about which clauses or functions are required for the task.",
                            hint_2: "Construct the query based on what result the exercise expects, not by repeating exact solution wording.",
                        },
                        starterCode: "print('hi')\n",
                        solutionCode: "print('hi')\n",
                    },
                ],
            } as any,
        });

        const exercise = result.draft.quizDraft[0] as any;
        expect(exercise.hint).toContain("programming task");
        expect(exercise.help.concept).toContain("Build the program");
        expect(exercise.help.hint_1).toContain("Python statements");
        expect(exercise.help.hint_2).toContain("Construct the code");
        expect(result.report.repairs.length).toBe(4);
    });

    it("adds a fallback fill_blank_choice when the planned mix requires one", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "if-elif-else",
                title: "If, Elif, and Else",
                summary: "Control which code runs based on conditions.",
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 1,
                        code_input: 2,
                    },
                },
            } as any,
            draft: {
                title: "If, Elif, and Else",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Use if statements.",
                        help: {
                            concept: "Use conditionals.",
                            hint_1: "Compare values.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def f(x):\n    pass\n",
                        solutionCode: "def f(x):\n    return x\n",
                    },
                    {
                        id: "q2",
                        kind: "code_input",
                        title: "Code 2",
                        prompt: "Write more Python code.",
                        hint: "Use elif.",
                        help: {
                            concept: "Use branches.",
                            hint_1: "Check another condition.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def g(x):\n    pass\n",
                        solutionCode: "def g(x):\n    return x\n",
                    },
                    {
                        id: "q3",
                        kind: "single_choice",
                        title: "Single",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["a", "b", "c"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "q4",
                        kind: "multi_choice",
                        title: "Multi",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["a", "b", "c"],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
        });

        expect(result.draft.quizDraft).toHaveLength(5);
        expect(
            result.draft.quizDraft.some(
                (exercise: any) =>
                    exercise.kind === "fill_blank_choice" &&
                    exercise.correctValue === "elif",
            ),
        ).toBe(true);
    });

    it("adds a fallback code_input when the planned mix requires another one", async () => {
        const result = await repairPythonDraft({
            seed: {
                topicId: "truthiness-and-empty-values",
                title: "Truthiness and Empty Values",
                summary: "Understand falsy values.",
                plannedExerciseCounts: {
                    total: 5,
                    dominantKind: "code_input",
                    counts: {
                        single_choice: 1,
                        multi_choice: 1,
                        drag_reorder: 0,
                        fill_blank_choice: 1,
                        code_input: 2,
                    },
                },
            } as any,
            draft: {
                title: "Truthiness",
                summary: "Summary",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "q1",
                        kind: "code_input",
                        title: "Code",
                        prompt: "Write Python code.",
                        hint: "Use bool.",
                        help: {
                            concept: "Truthy or falsy.",
                            hint_1: "Check the value.",
                            hint_2: "Return a result.",
                        },
                        starterCode: "def f(x):\n    pass\n",
                        solutionCode: "def f(x):\n    return bool(x)\n",
                    },
                    {
                        id: "q2",
                        kind: "fill_blank_choice",
                        title: "Fill",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        template: "___",
                        choices: ["''", "1", "True"],
                        correctValue: "''",
                    },
                    {
                        id: "q3",
                        kind: "single_choice",
                        title: "Single",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["0", "1", "2"],
                        correctOptionIds: ["a"],
                    },
                    {
                        id: "q4",
                        kind: "multi_choice",
                        title: "Multi",
                        prompt: "Question",
                        hint: "Hint",
                        help: {
                            concept: "Concept",
                            hint_1: "Hint 1",
                            hint_2: "Hint 2",
                        },
                        options: ["''", "0", "1"],
                        correctOptionIds: ["a", "b"],
                    },
                ],
            } as any,
        });

        expect(result.draft.quizDraft).toHaveLength(5);
        expect(
            result.draft.quizDraft.filter((exercise: any) => exercise.kind === "code_input"),
        ).toHaveLength(2);
        expect(
            result.draft.quizDraft.some(
                (exercise: any) =>
                    exercise.kind === "code_input" &&
                    exercise.solutionCode.includes("has_items"),
            ),
        ).toBe(true);
    });
});
