
import { describe, expect, it } from "vitest";
import { repairTopicAuthoringDraft } from "../repairTopicAuthoringDraft.js";
import { assertTopicAuthoringDraft } from "../../validate/assertTopicAuthoringDraft.js";

describe("repair -> assert integration", () => {
    it("repairs a common fill-blank mismatch so assert passes", () => {
        const repaired = repairTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Fill",
                    prompt: "Complete the statement.",
                    hint: "Think about filtering rows.",
                    help: {
                        concept: "Filtering rows uses a clause.",
                        hint_1: "This clause comes before the condition.",
                        hint_2: "Choose the clause that filters rows.",
                    },
                    template: "SELECT * FROM users ___ age > 18",
                    choices: ["WHERE", "ORDER BY"],
                    correctValue: " where ",
                },
            ],
        } as any);

        expect(() => assertTopicAuthoringDraft(repaired as any)).not.toThrow();
    });
});