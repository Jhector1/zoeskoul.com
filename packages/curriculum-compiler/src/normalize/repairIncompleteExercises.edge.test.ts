
import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul/curriculum-ai", () => ({
    repairExercise: vi.fn(async (_provider, { exercise }) => exercise),
}));

import { repairIncompleteExercises } from "./repairIncompleteExercises.js";

describe("repairIncompleteExercises edge cases", () => {
    it("normalizes empty multi_choice correctOptionIds to an empty array but keeps structure intact", async () => {
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
                        id: "multi-1",
                        kind: "multi_choice",
                        title: "Multi",
                        prompt: "Pick all valid clauses.",
                        hint: "Think about SQL.",
                        help: {
                            concept: "Some options are valid SQL clauses.",
                            hint_1: "Pick one or more valid options.",
                            hint_2: "Choose all that apply.",
                        },
                        options: ["SELECT", "BANANA"],
                        correctOptionIds: undefined,
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(Array.isArray(exercise.correctOptionIds)).toBe(true);
    });

    it("fills recipeType for sql code_input exercises deterministically", async () => {
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
                        hint: "Use SELECT.",
                        help: {
                            concept: "You need SQL.",
                            hint_1: "Return rows.",
                            hint_2: "Write a valid query.",
                        },
                        starterCode: "SELECT * FROM students;",
                        solutionCode: "SELECT * FROM students;",
                        recipeType: undefined,
                        datasetId: "",
                    },
                ],
            } as any,
        });

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.recipeType).toBe("sql_query");
        expect(exercise.datasetId).toBe("students_intro");
    });
});