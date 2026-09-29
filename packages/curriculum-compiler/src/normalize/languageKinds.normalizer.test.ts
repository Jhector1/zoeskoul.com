import { describe, expect, it } from "vitest";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";
import { repairTopicAuthoringDraft } from "./repairTopicAuthoringDraft.js";

const help = {
    concept: "Use the Kreyòl target.",
    hint_1: "Read the target carefully.",
    hint_2: "Keep the Kreyòl wording intact.",
};

const languageExercises = [
    {
        id: "text",
        kind: "text_input",
        title: "Write mèsi",
        prompt: "Write the target.",
        hint: "Keep the accent.",
        help,
        expectedText: "mèsi",
        anyOf: ["mèsi"],
        placeholder: "Type Kreyòl",
        normalize: {
            trim: true,
            caseFold: true,
            collapseSpaces: true,
            stripPunct: false,
        },
    },
    {
        id: "voice",
        kind: "voice_input",
        title: "Say bonjou",
        prompt: "Say the target.",
        hint: "Say the full greeting.",
        help,
        targetText: "bonjou",
        anyOf: ["bonjou"],
        locale: "ht-HT",
        maxSeconds: 8,
        normalize: {
            trim: true,
            caseFold: true,
        },
    },
    {
        id: "bank",
        kind: "word_bank_arrange",
        title: "Build wi mèsi",
        prompt: "Build the target.",
        hint: "Keep the order.",
        help,
        targetText: "Wi, mèsi.",
        anyOf: ["Wi, mèsi."],
        locale: "ht-HT",
        wordBank: ["Wi,", "mèsi."],
        distractors: ["non"],
        ttsText: "Wi, mèsi.",
        normalize: {
            trim: true,
            collapseSpaces: true,
        },
    },
    {
        id: "listen",
        kind: "listen_build",
        title: "Hear wi mèsi",
        prompt: "Rebuild what you hear.",
        hint: "Listen to the whole phrase.",
        help,
        targetText: "Wi, mèsi.",
        anyOf: ["Wi, mèsi."],
        locale: "ht-HT",
        wordBank: ["Wi,", "mèsi."],
        distractors: ["non"],
        normalize: {
            trim: true,
            caseFold: true,
        },
    },
] as const;

describe("normalizeTopicAuthoringDraft native language kinds", () => {
    it("preserves all four native kinds in normal quizDraft", () => {
        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Language",
                summary: "Language practice",
                minutes: 10,
                sketchBlocks: [],
                quizDraft: languageExercises,
            },
            { profileId: "language" },
        );

        expect(normalized.quizDraft.map((x) => x.kind)).toEqual([
            "text_input",
            "voice_input",
            "word_bank_arrange",
            "listen_build",
        ]);

        expect(normalized.quizDraft[0]).toMatchObject({
            kind: "text_input",
            expectedText: "mèsi",
        });
        expect(normalized.quizDraft[1]).toMatchObject({
            kind: "voice_input",
            targetText: "bonjou",
            locale: "ht-HT",
            maxSeconds: 8,
        });
        expect(normalized.quizDraft[2]).toMatchObject({
            kind: "word_bank_arrange",
            targetText: "Wi, mèsi.",
            wordBank: ["Wi,", "mèsi."],
            distractors: ["non"],
            ttsText: "Wi, mèsi.",
        });
        expect(normalized.quizDraft[3]).toMatchObject({
            kind: "listen_build",
            targetText: "Wi, mèsi.",
            wordBank: ["Wi,", "mèsi."],
            distractors: ["non"],
        });
    });

    it("preserves the same four kinds when nested under a sketch", () => {
        const normalized = normalizeTopicAuthoringDraft(
            {
                title: "Language",
                summary: "Language practice",
                minutes: 10,
                sketchBlocks: [
                    {
                        id: "s1",
                        title: "Practice",
                        bodyMarkdown: "Practice the language.",
                        tryItExercises: languageExercises,
                    },
                ],
                quizDraft: [],
            },
            { profileId: "language" },
        );

        expect(
            normalized.sketchBlocks[0]?.tryItExercises?.map((x) => x.kind),
        ).toEqual([
            "text_input",
            "voice_input",
            "word_bank_arrange",
            "listen_build",
        ]);

        const repaired = repairTopicAuthoringDraft(
            normalized,
            {
                profileId: "language",
                topicId: "language",
            } as any,
        );

        expect(
            repaired.sketchBlocks[0]?.tryItExercises?.map((x) => x.kind),
        ).toEqual([
            "text_input",
            "voice_input",
            "word_bank_arrange",
            "listen_build",
        ]);
    });
});
