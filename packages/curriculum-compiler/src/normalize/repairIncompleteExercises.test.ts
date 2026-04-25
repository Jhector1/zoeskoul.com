import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul/curriculum-ai", () => ({
    repairExercise: vi.fn(async (_provider, { exercise }) => exercise),
}));

import { repairIncompleteExercises } from "./repairIncompleteExercises.js";

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
});