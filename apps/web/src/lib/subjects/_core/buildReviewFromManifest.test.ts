import { describe, expect, it, vi } from "vitest";

import { buildReviewFromManifestCore } from "../../../../../../packages/curriculum-runtime/src/review/buildReviewFromManifestCore";
import { buildReviewFromManifest } from "./buildReviewFromManifest";

vi.mock("@/lib/practice/generator/shared/i18n", () => ({
    tag: (key: string) => `translated:${key}`,
}));

describe("buildReviewFromManifest try-it project cards", () => {
    it("preserves a try- project card id and runtime marker fields", () => {
        const { topic } = buildReviewFromManifestCore({
            manifest: {
                prefix: "topics.python-v2.python-v2-1",
                topicId: "write-mode-basics",
                subjectSlug: "python-v2",
                moduleSlug: "module-1",
                sectionSlug: "section-1",
                minutes: 5,
                topic: {
                    labelKey: "topic.label",
                    summaryKey: "topic.summary",
                },
                cards: [
                    {
                        id: "try-write-mode-basics",
                        kind: "project",
                        titleKey: "cards.try.title",
                        project: {
                            difficulty: "easy",
                            allowReveal: false,
                            preferKind: "code_input",
                            tryIt: true,
                            uiKind: "try_it",
                            displayKind: "try_it",
                            steps: [
                                {
                                    id: "try_write_note_file",
                                    titleKey: "steps.try.title",
                                    exerciseKey: "try-write-note-file",
                                    preferKind: "code_input",
                                    seedPolicy: "global",
                                },
                            ],
                        },
                    },
                ],
                sketches: [],
                exercises: [],
            } as any,
            pool: [],
            tag: (key: string) => key,
            makeTopicDef: (input: Record<string, unknown>) => input,
        });

        const card = topic.cards[0];
        expect(card).toMatchObject({
            type: "project",
            id: "try-write-mode-basics",
            tryIt: true,
            spec: {
                mode: "project",
                tryIt: true,
                uiKind: "try_it",
                displayKind: "try_it",
            },
        });

        if (card?.type !== "project") {
            throw new Error("expected a project card");
        }

        expect(card.spec.steps).toHaveLength(1);
        expect(card.spec.steps[0]).toMatchObject({
            id: "try_write_note_file",
            exerciseKey: "try-write-note-file",
            preferKind: "code_input",
            seedPolicy: "global",
        });
    });

    it("keeps a normal one-step project as a normal project runtime card", () => {
        const { topic } = buildReviewFromManifestCore({
            manifest: {
                prefix: "topics.python-v2.python-v2-1",
                topicId: "write-mode-basics",
                subjectSlug: "python-v2",
                moduleSlug: "module-1",
                sectionSlug: "section-1",
                minutes: 5,
                topic: {
                    labelKey: "topic.label",
                    summaryKey: "topic.summary",
                },
                cards: [
                    {
                        id: "project",
                        kind: "project",
                        titleKey: "cards.project.title",
                        project: {
                            difficulty: "easy",
                            allowReveal: false,
                            preferKind: "code_input",
                            steps: [
                                {
                                    id: "write_note_file",
                                    titleKey: "steps.project.title",
                                    exerciseKey: "write-note-file",
                                    preferKind: "code_input",
                                    seedPolicy: "global",
                                },
                            ],
                        },
                    },
                ],
                sketches: [],
                exercises: [],
            } as any,
            pool: [],
            tag: (key: string) => key,
            makeTopicDef: (input: Record<string, unknown>) => input,
        });

        const card = topic.cards[0];
        expect(card).toMatchObject({
            type: "project",
        });

        if (card?.type !== "project") {
            throw new Error("expected a project card");
        }

        expect(card.id).toBe("write-mode-basics_p0");
        expect(card.tryIt).toBeUndefined();
        expect(card.spec.tryIt).toBeUndefined();
        expect(card.spec.uiKind).toBeUndefined();
        expect(card.spec.displayKind).toBeUndefined();
        expect(card.spec.steps).toHaveLength(1);
    });

    it("preserves embedded try it on sketch cards in the app wrapper", () => {
        const built = buildReviewFromManifest({
            manifest: {
                prefix: "py5",
                topicId: "list-methods-and-mutation",
                subjectSlug: "python-data-functions",
                moduleSlug: "python-5-lists-tuples-and-dictionaries",
                sectionSlug: "python-data-functions-python-5-list-basics",
                minutes: 5,
                runtimeDefaults: {
                    kind: "code",
                    language: "python",
                },
                topic: {
                    labelKey: "topic.label",
                    summaryKey: "topic.summary",
                },
                cards: [
                    {
                        id: "sketch0",
                        kind: "sketch",
                        titleKey: "cards.sketch0.title",
                        sketchId: "sketch-1",
                        tryIt: {
                            id: "try-append-ten-to-list",
                            titleKey: "tryIt.title",
                            promptKey: "tryIt.prompt",
                            exerciseKey: "try-append-ten-to-list",
                            difficulty: "easy",
                            preferKind: "code_input",
                            seedPolicy: "global",
                            required: true,
                            allowReveal: false,
                            maxAttempts: null,
                        },
                    },
                ],
                sketches: [
                    {
                        id: "sketch-1",
                        archetype: "paragraph",
                        titleKey: "sketch.title",
                        bodyKey: "sketch.body",
                    },
                ],
                exercises: [],
            } as any,
            pool: [],
        });

        const card = built.topic.cards[0];
        if (card.type !== "sketch") {
            throw new Error("expected sketch card");
        }

        expect(card.id).toBe("list-methods-and-mutation_s0");
        expect(card.tryIt).toMatchObject({
            id: "try-append-ten-to-list",
            title: "translated:tryIt.title",
            prompt: "translated:tryIt.prompt",
            exerciseKey: "try-append-ten-to-list",
            required: true,
            allowReveal: true,
            spec: {
                mode: "project",
                subject: "python-data-functions",
                moduleSlug: "python-5-lists-tuples-and-dictionaries",
                section: "python-data-functions-python-5-list-basics",
                topic: "py5.list-methods-and-mutation",
                tryIt: true,
                uiKind: "try_it",
                displayKind: "try_it",
            },
        });
        expect(card.tryIt?.spec.steps).toHaveLength(1);
        expect(card.tryIt?.spec.steps[0]).toMatchObject({
            id: "try_append_ten_to_list",
            exerciseKey: "try-append-ten-to-list",
            preferKind: "code_input",
            seedPolicy: "global",
        });
    });
});
