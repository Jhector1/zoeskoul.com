
import { describe, expect, it } from "vitest";
import { validateExerciseHints } from "./validateExerciseHints.js";

describe("validateExerciseHints regressions", () => {
    it("flags a multi_choice hint that leaks exact WHERE-condition answers", () => {
        const warnings = validateExerciseHints({
            title: "The WHERE clause",
            summary: "Filtering rows",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "multichoice-where-conditions",
                    kind: "multi_choice",
                    title: "WHERE conditions",
                    prompt: "Select all expressions that can be used as WHERE conditions.",
                    hint: "Choose price > 10 and name = 'Pen'.",
                    help: {
                        concept: "The answer uses price > 10 and name = 'Pen'.",
                        hint_1: "Pick price > 10 and name = 'Pen'.",
                        hint_2: "Do not choose ORDER BY price or GROUP BY category.",
                    },
                    options: [
                        "price > 10",
                        "name = 'Pen'",
                        "ORDER BY price",
                        "GROUP BY category",
                    ],
                    correctOptionIds: ["a", "b"],
                },
            ],
        } as any);

        expect(warnings).toContain(
            "Hint reveals answer in exercise multichoice-where-conditions",
        );
    });

    it("does not flag safe conceptual hints for a multi_choice exercise", () => {
        const warnings = validateExerciseHints({
            title: "The WHERE clause",
            summary: "Filtering rows",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "multichoice-where-conditions",
                    kind: "multi_choice",
                    title: "WHERE conditions",
                    prompt: "Select all expressions that can be used as WHERE conditions.",
                    hint: "Pick the choices that represent actual row-filtering conditions.",
                    help: {
                        concept: "WHERE conditions compare or match row values.",
                        hint_1: "Eliminate clauses that sort or group instead of filtering.",
                        hint_2: "Choose expressions that could appear directly after WHERE.",
                    },
                    options: [
                        "price > 10",
                        "name = 'Pen'",
                        "ORDER BY price",
                        "GROUP BY category",
                    ],
                    correctOptionIds: ["a", "b"],
                },
            ],
        } as any);

        expect(warnings).toEqual([]);
    });

    it("does not flag generic boolean operator words as leaked answers", () => {
        const warnings = validateExerciseHints({
            title: "Boolean operators",
            summary: "Combine conditions",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "multi-boolean-ops",
                    kind: "multi_choice",
                    title: "Boolean operators",
                    prompt: "Which of the following are boolean operators?",
                    hint: "Focus on operators that combine or invert conditions.",
                    help: {
                        concept: "Boolean operators are used to combine or modify conditions.",
                        hint_1: "Think about operators used in logical expressions.",
                        hint_2: "Ignore control-flow keywords that are not operators.",
                    },
                    options: ["AND", "OR", "IF", "NOT"],
                    correctOptionIds: ["a", "b", "d"],
                },
            ],
        } as any);

        expect(warnings).toEqual([]);
    });

    it("flags single_choice hints that reveal exact correct option text", () => {
        const warnings = validateExerciseHints({
            title: "Ordering",
            summary: "Sort rows",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "Order rows",
                    prompt: "Which clause sorts results?",
                    hint: "Use ORDER BY.",
                    help: {
                        concept: "The answer is ORDER BY.",
                        hint_1: "Think of ORDER BY.",
                        hint_2: "Choose ORDER BY.",
                    },
                    options: ["WHERE", "ORDER BY", "GROUP BY"],
                    correctOptionIds: ["b"],
                },
            ],
        } as any);

        expect(warnings).toEqual([
            "Hint reveals answer in exercise single-1",
        ]);
    });
});
