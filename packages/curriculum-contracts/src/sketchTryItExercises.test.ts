import { describe, expect, it } from "vitest";
import {
    assertTopicAuthoringDraft,
    type TopicAuthoringDraft,
} from "./topic-authoring-draft.js";

const help = {
    concept: "Concept",
    hint_1: "Hint 1",
    hint_2: "Hint 2",
};

const normalExercise = {
    id: "normal-choice",
    kind: "single_choice" as const,
    title: "Normal practice",
    prompt: "Choose Bonjou.",
    hint: "Look for the greeting.",
    help,
    options: ["Bonjou", "Orevwa"],
    correctOptionIds: ["a"],
};

function dedicated(id: string) {
    return {
        id,
        kind: "listen_build" as const,
        title: "Try the greeting",
        prompt: "Build the greeting from this sketch.",
        hint: "Listen to the greeting.",
        help,
        targetText: "Bonjou.",
        locale: "ht-HT",
    };
}

function makeDraft(
    tryItExercises: TopicAuthoringDraft["quizDraft"] | undefined,
): TopicAuthoringDraft {
    return {
        title: "Greeting practice",
        summary: "Practice the sketch.",
        minutes: 10,
        sketchBlocks: [
            {
                id: "greeting",
                title: "Greeting",
                bodyMarkdown: "The sketch teaches **Bonjou**.",
                ...(tryItExercises ? { tryItExercises } : {}),
            },
        ],
        quizDraft: [normalExercise],
    };
}

describe("sketchBlock.tryItExercises", () => {
    it("accepts zero dedicated Try It exercises", () => {
        expect(() => assertTopicAuthoringDraft(makeDraft(undefined))).not.toThrow();
    });

    it("accepts 1-3 exercises using the same canonical exercise validator", () => {
        expect(() =>
            assertTopicAuthoringDraft(
                makeDraft([
                    dedicated("try-1"),
                    dedicated("try-2"),
                    dedicated("try-3"),
                ]),
            ),
        ).not.toThrow();
    });

    it("rejects more than three dedicated exercises", () => {
        expect(() =>
            assertTopicAuthoringDraft(
                makeDraft([
                    dedicated("try-1"),
                    dedicated("try-2"),
                    dedicated("try-3"),
                    dedicated("try-4"),
                ]),
            ),
        ).toThrow(/must contain 1 to 3 dedicated exercises/);
    });

    it("validates nested exercises with the same language rules", () => {
        const invalid = dedicated("try-invalid") as any;
        invalid.targetText = "";
        expect(() =>
            assertTopicAuthoringDraft(makeDraft([invalid])),
        ).toThrow(/listen_build needs targetText/);
    });

    it("rejects an id reused between normal practice and Try It", () => {
        expect(() =>
            assertTopicAuthoringDraft(
                makeDraft([dedicated("normal-choice")]),
            ),
        ).toThrow(/exercise ids must be unique/);
    });
});
