
import { describe, expect, it } from "vitest";
import { repairTopicAuthoringDraft } from "./repairTopicAuthoringDraft.js";
import { validateExerciseHints } from "../validate/validateExerciseHints.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";

describe("repairTopicAuthoringDraft regressions", () => {
    it("sanitizes leaked multi_choice WHERE-condition hints so validation passes", () => {
        const repaired = repairTopicAuthoringDraft({
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

        expect(validateExerciseHints(repaired as any)).toEqual([]);
        expect(() => assertTopicAuthoringDraft(repaired as any)).not.toThrow();
    });

    it("repairs single_choice with multiple correctOptionIds down to one", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "SELECT basics",
            summary: "Selecting columns",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "Pick one",
                    prompt: "Which clause starts a basic query?",
                    hint: "Focus on the opening clause.",
                    help: {
                        concept: "A basic query starts with a clause.",
                        hint_1: "It names the columns or expressions to return.",
                        hint_2: "Choose the clause used to begin a query.",
                    },
                    options: ["SELECT", "WHERE", "ORDER BY"],
                    correctOptionIds: ["a", "b"],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctOptionIds).toHaveLength(1);
    });

    it("repairs drag_reorder correctOrder to use only actual tokens", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Clause order",
            summary: "Ordering SQL parts",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "drag-1",
                    kind: "drag_reorder",
                    title: "Order SQL parts",
                    prompt: "Put the clauses in order.",
                    hint: "Think about the structure of a SQL query.",
                    help: {
                        concept: "SQL clauses follow a standard structure.",
                        hint_1: "Start with retrieving rows before filtering them.",
                        hint_2: "Put the query parts in their normal order.",
                    },
                    tokens: ["SELECT", "FROM", "WHERE"],
                    correctOrder: ["select", "from", "where"],
                },
            ],
        } as any);

        const exercise = repaired.quizDraft[0] as any;
        expect(exercise.correctOrder).toEqual(["SELECT", "FROM", "WHERE"]);
    });
});