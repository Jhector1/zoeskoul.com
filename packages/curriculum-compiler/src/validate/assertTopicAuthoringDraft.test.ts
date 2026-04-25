import { describe, expect, it } from "vitest";
import { assertTopicAuthoringDraft } from "./assertTopicAuthoringDraft.js";

function makeValidDraft() {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [
            {
                id: "sketch-1",
                title: "Sketch",
                bodyMarkdown: "Body",
            },
        ],
        quizDraft: [
            {
                id: "fillblank-1",
                kind: "fill_blank_choice" as const,
                title: "Fill blank",
                prompt: "Choose the right SQL term.",
                hint: "Focus on the missing concept.",
                help: {
                    concept: "The blank needs a SQL term.",
                    hint_1: "Think about what the blank does.",
                    hint_2: "Choose the term that completes the statement.",
                },
                template: "SELECT * FROM users WHERE age ___ 18",
                choices: [">", "<", "="],
                correctValue: ">",
            },
        ],
    };
}

describe("assertTopicAuthoringDraft", () => {
    it("accepts a valid fill_blank_choice when correctValue is included in choices", () => {
        const draft = makeValidDraft();
        expect(() => assertTopicAuthoringDraft(draft as any)).not.toThrow();
    });

    it("rejects fill_blank_choice when correctValue is missing", () => {
        const draft = makeValidDraft();
        draft.quizDraft[0].correctValue = "";

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /fill_blank_choice needs correctValue/,
        );
    });

    it("rejects fill_blank_choice when correctValue is not included in choices", () => {
        const draft = makeValidDraft();
        draft.quizDraft[0].correctValue = ">=";

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /correctValue must be included in choices/,
        );
    });

    it("rejects multi_choice with no correctOptionIds", () => {
        const draft = {
            ...makeValidDraft(),
            quizDraft: [
                {
                    id: "multi-1",
                    kind: "multi_choice" as const,
                    title: "Multi",
                    prompt: "Pick all valid clauses.",
                    hint: "Think about SQL clauses.",
                    help: {
                        concept: "Some clauses are valid in SQL.",
                        hint_1: "Pick one or more valid options.",
                        hint_2: "Choose all that apply.",
                    },
                    options: ["SELECT", "BANANA"],
                    correctOptionIds: [],
                },
            ],
        };

        expect(() => assertTopicAuthoringDraft(draft as any)).toThrow(
            /multi_choice needs at least 1 correctOptionIds entry/,
        );
    });
});