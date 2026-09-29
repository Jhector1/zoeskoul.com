import { describe, expect, it } from "vitest";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";
import { repairTopicAuthoringDraft } from "./repairTopicAuthoringDraft.js";

const help = {
    concept: "Use the exact greeting from the sketch.",
    hint_1: "Keep the word intact.",
    hint_2: "Say Bonjou.",
};

describe("sketch tryItExercises normalize/repair pipeline", () => {
    it("preserves and normalizes dedicated exercises through both stages", () => {
        const raw = {
            title: "Greeting",
            summary: "Practice Bonjou.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "greeting",
                    title: "Use Bonjou",
                    bodyMarkdown: "**Bonjou** is a greeting.",
                    tryItExercises: [
                        {
                            id: "try-greeting-speak",
                            kind: "voice_input",
                            title: "Say Bonjou",
                            prompt: "Say the greeting from the sketch.",
                            hint: "Use the complete greeting.",
                            help,
                            targetText: "Bonjou",
                            locale: "ht-HT",
                        },
                        {
                            id: "try-greeting-build",
                            kind: "word_bank_arrange",
                            title: "Build Bonjou",
                            prompt: "Build the greeting.",
                            hint: "Use the word from the sketch.",
                            help,
                            targetText: "Bonjou",
                            locale: "ht-HT",
                            wordBank: ["Bonjou"],
                        },
                    ],
                },
            ],
            quizDraft: [
                {
                    id: "normal-choice",
                    kind: "single_choice",
                    title: "Normal quiz",
                    prompt: "Choose Bonjou.",
                    hint: "Choose the greeting.",
                    help,
                    options: ["Bonjou", "Orevwa"],
                    correctOptionIds: ["a"],
                },
            ],
        };

        const normalized = normalizeTopicAuthoringDraft(raw, {
            profileId: "language",
        });

        expect(normalized.sketchBlocks[0]?.tryItExercises).toHaveLength(2);
        expect(normalized.sketchBlocks[0]?.tryItExercises?.map((x) => x.kind)).toEqual([
            "voice_input",
            "word_bank_arrange",
        ]);

        const repaired = repairTopicAuthoringDraft(
            normalized,
            {
                profileId: "language",
                topicId: "greeting",
            } as any,
        );

        expect(repaired.sketchBlocks[0]?.tryItExercises).toHaveLength(2);
        expect(repaired.sketchBlocks[0]?.tryItExercises?.map((x) => x.id)).toEqual([
            "try-greeting-speak",
            "try-greeting-build",
        ]);
        expect(repaired.quizDraft.map((x) => x.id)).toEqual(["normal-choice"]);
    });
});
