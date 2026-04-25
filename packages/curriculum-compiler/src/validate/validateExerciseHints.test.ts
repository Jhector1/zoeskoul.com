
import { describe, expect, it } from "vitest";
import { validateExerciseHints } from "./validateExerciseHints.js";

describe("validateExerciseHints", () => {
    it("flags fill-blank hints that reveal the exact answer", () => {
        const warnings = validateExerciseHints({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Fill",
                    prompt: "Choose the SQL clause.",
                    hint: "Use WHERE here.",
                    help: {
                        concept: "The answer is WHERE.",
                        hint_1: "Try WHERE.",
                        hint_2: "The missing value is WHERE.",
                    },
                    template: "SELECT * FROM users ___ age > 18",
                    choices: ["WHERE", "ORDER BY"],
                    correctValue: "WHERE",
                },
            ],
        } as any);

        expect(warnings).toEqual([
            "Hint reveals fill_blank answer in exercise fill-1",
        ]);
    });

    it("does not falsely flag a generic article when correctOptionIds are letters", () => {
        const warnings = validateExerciseHints({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "Single",
                    prompt: "Pick the right concept.",
                    hint: "Think about a basic beginner concept.",
                    help: {
                        concept: "Match the idea, not the wording.",
                        hint_1: "Eliminate wrong concepts.",
                        hint_2: "Choose the option that best fits.",
                    },
                    options: ["Table", "Column"],
                    correctOptionIds: ["a"],
                },
            ],
        } as any);

        // This is a RED test against the old buggy implementation that checks ids like "a"
        // instead of actual correct option text.
        expect(warnings).toEqual([]);
    });
});