import { describe, expect, it } from "vitest";

import { buildReviewFromManifest } from "./buildReviewFromManifest";

describe("embedded Try It non-code exercise field preservation", () => {
    it("preserves the complete word_bank_arrange payload in the project step", () => {
        const exercise = {
            id: "wb-introduction",
            kind: "word_bank_arrange",
            purpose: "try_it",
            weight: 1,
            messageBase: "topics.test.wb-introduction",
            targetText: "M rele Mari.",
            locale: "ht-HT",
            wordBank: ["M", "rele", "Mari."],
            distractors: ["se"],
            ttsText: "M rele Mari.",
            expected: {
                kind: "word_bank_arrange",
                targetText: "M rele Mari.",
                locale: "ht-HT",
            },
        };

        const built = buildReviewFromManifest({
            manifest: {
                prefix: "topics.test.module-1",
                topicId: "introductions",
                subjectSlug: "test-language",
                moduleSlug: "module-1",
                sectionSlug: "section-1",
                minutes: 5,
                topic: {
                    labelKey: "topic.label",
                    summaryKey: "topic.summary",
                },
                cards: [
                    {
                        id: "sketch-card",
                        kind: "sketch",
                        titleKey: "card.title",
                        sketchId: "intro-sketch",
                        tryIt: {
                            id: "try-introduction",
                            titleKey: "try.title",
                            promptKey: "try.prompt",
                            exerciseKey: exercise.id,
                            difficulty: "easy",
                            preferKind: "word_bank_arrange",
                        },
                    },
                ],
                sketches: [
                    {
                        id: "intro-sketch",
                        archetype: "paragraph",
                        titleKey: "sketch.title",
                        bodyKey: "sketch.body",
                    },
                ],
                exercises: [exercise],
            } as any,
            pool: [
                {
                    key: exercise.id,
                    w: 1,
                    kind: exercise.kind,
                    purpose: exercise.purpose,
                },
            ],
            resolveText: (key) => key,
        });

        const card = built.topic.cards.find(
            (candidate: any) => candidate.id === "introductions_s0",
        ) as any;

        expect(card).toBeDefined();
        expect(card.type).toBe("sketch");
        expect(card?.tryIt?.spec?.steps).toHaveLength(1);

        expect(card.tryIt.spec.steps[0]).toMatchObject({
            kind: "word_bank_arrange",
            exerciseKey: "wb-introduction",
            targetText: "M rele Mari.",
            locale: "ht-HT",
            wordBank: ["M", "rele", "Mari."],
            distractors: ["se"],
            ttsText: "M rele Mari.",
            expected: {
                kind: "word_bank_arrange",
                targetText: "M rele Mari.",
                locale: "ht-HT",
            },
        });
    });
});
