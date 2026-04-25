
import { describe, expect, it } from "vitest";
import { repairTopicAuthoringDraft } from "../normalize/repairTopicAuthoringDraft.js";
import { validateExerciseHints } from "../validate/validateExerciseHints.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";

describe("compile failure regression fixtures", () => {
    it("placeholder for fixture-driven regressions", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Fixture",
            summary: "Fixture",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Fill",
                    prompt: "Choose the missing clause.",
                    hint: "Think about filtering.",
                    help: {
                        concept: "Filtering uses a clause.",
                        hint_1: "It comes before the condition.",
                        hint_2: "Choose the clause that filters rows.",
                    },
                    template: "SELECT * FROM users ___ age > 18",
                    choices: ["WHERE", "ORDER BY"],
                    correctValue: " where ",
                },
            ],
        } as any);

        expect(validateExerciseHints(repaired as any)).toEqual([]);
        expect(() => assertTopicAuthoringDraft(repaired as any)).not.toThrow();
    });
});