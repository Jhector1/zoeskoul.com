import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type {
    ReviewProgressState,
    ReviewTopicProgress,
} from "@/lib/subjects/progressTypes";

import {
    buildMarkCardDoneProgress,
    buildQuizPassProgress,
    buildQuizResetProgress, buildResetModuleProgress, buildResetTopicProgress,
} from "./actions";

import {
    getModuleProgress, getSidebarTopicItems,
    moduleCompleteFromProgress,
} from "./selectors";

import {
    countAnswered,
    isTopicComplete,
} from "./utils";

import ReviewTopicCompletion from "./components/content/ReviewTopicCompletion";

type CardOverrides =
    | (Partial<Extract<ReviewCard, { type: "text" }>> & {
        id: string;
        type?: "text";
    })
    | (Partial<Extract<ReviewCard, { type: "sketch" }>> & {
        id: string;
        type: "sketch";
    })
    | (Partial<Extract<ReviewCard, { type: "quiz" }>> & {
        id: string;
        type: "quiz";
    })
    | (Partial<Extract<ReviewCard, { type: "project" }>> & {
        id: string;
        type: "project";
    })
    | (Partial<Extract<ReviewCard, { type: "video" }>> & {
        id: string;
        type: "video";
    });

function card(overrides: CardOverrides): ReviewCard {
    if (overrides.type === "sketch") {
        const next: Extract<ReviewCard, { type: "sketch" }> = {
            ...overrides,
            type: "sketch",
            id: overrides.id,
            title: overrides.title ?? overrides.id,
            sketchId: overrides.sketchId ?? overrides.id,
        };

        return next;
    }

    if (overrides.type === "quiz") {
        const next: Extract<ReviewCard, { type: "quiz" }> = {
            ...overrides,
            type: "quiz",
            id: overrides.id,
            title: overrides.title ?? overrides.id,
            spec: overrides.spec ?? {
                subject: "python-v2",
                moduleSlug: "module-1",
            },
        };

        return next;
    }

    if (overrides.type === "project") {
        const next: Extract<ReviewCard, { type: "project" }> = {
            ...overrides,
            type: "project",
            id: overrides.id,
            title: overrides.title ?? overrides.id,
            spec: overrides.spec ?? {
                mode: "project",
                subject: "python-v2",
                moduleSlug: "module-1",
                steps: [],
            },
        };

        return next;
    }

    if (overrides.type === "video") {
        const next: Extract<ReviewCard, { type: "video" }> = {
            ...overrides,
            type: "video",
            id: overrides.id,
            title: overrides.title ?? overrides.id,
            url: overrides.url ?? "",
        };

        return next;
    }

    const next: Extract<ReviewCard, { type: "text" }> = {
        ...overrides,
        type: "text",
        id: overrides.id,
        title: overrides.title ?? overrides.id,
        markdown: overrides.markdown ?? "",
    };

    return next;
}

function topic(
    id: string,
    cards: ReviewCard[],
    overrides: Record<string, unknown> = {},
): ReviewModule["topics"][number] {
    return {
        id,
        label: id,
        summary: "",
        cards,
        ...overrides,
    };
}

function progressTopic(
    progress: ReviewProgressState,
    topicId: string,
): ReviewTopicProgress {
    return progress?.topics?.[topicId] ?? {};
}

describe("review module completion/navigation source of truth", () => {
    it("does not mark a topic complete until all reading/sketch cards and quiz cards are complete", () => {
        const topicId = "input-and-type-conversion";

        const cards = [
            card({ id: "read-intro", type: "text" }),
            card({ id: "practice-sketch", type: "sketch" }),
            card({ id: "profile-line", type: "quiz" }),
        ];

        let progress: ReviewProgressState = {
            topics: {},
        };

        expect(countAnswered(cards, progressTopic(progress, topicId), topicId)).toEqual({
            answeredCount: 0,
            sessionSize: 3,
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);

        progress = buildMarkCardDoneProgress(progress, topicId, cards[0]);

        expect(countAnswered(cards, progressTopic(progress, topicId), topicId)).toEqual({
            answeredCount: 1,
            sessionSize: 3,
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);

        progress = buildMarkCardDoneProgress(progress, topicId, cards[1]);

        expect(countAnswered(cards, progressTopic(progress, topicId), topicId)).toEqual({
            answeredCount: 2,
            sessionSize: 3,
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);

        progress = buildQuizPassProgress(progress, topicId, "profile-line");

        expect(countAnswered(cards, progressTopic(progress, topicId), topicId)).toEqual({
            answeredCount: 3,
            sessionSize: 3,
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(true);
    });

    it("marks a topic complete when the final quiz passes even if earlier reading cards were not explicitly marked done", () => {
        const topicId = "input-and-type-conversion";

        const cards = [
            card({ id: "read-intro", type: "text" }),
            card({ id: "practice-note", type: "sketch" }),
            card({ id: "profile-line", type: "quiz" }),
        ];

        let progress: ReviewProgressState = {
            topics: {},
        };

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);

        progress = buildQuizPassProgress(progress, topicId, "profile-line", cards);

        expect(progress.topics?.[topicId]?.readingDone).toMatchObject({
            "read-intro": true,
            "practice-note": true,
        });

        expect(progress.topics?.[topicId]?.quizzesDone).toMatchObject({
            "profile-line": true,
        });

        expect(countAnswered(cards, progressTopic(progress, topicId), topicId)).toEqual({
            answeredCount: 3,
            sessionSize: 3,
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(true);
    });

    it("marks module progress from topic completion only, not from quiz UI state alone", () => {
        const topicAId = "variables-and-strings";
        const topicBId = "input-and-type-conversion";

        const topicACards = [
            card({ id: "read-a", type: "text" }),
            card({ id: "quiz-a", type: "quiz" }),
        ];

        const topicBCards = [
            card({ id: "read-b", type: "text" }),
            card({ id: "quiz-b", type: "quiz" }),
        ];

        const topics = [
            topic(topicAId, topicACards),
            topic(topicBId, topicBCards),
        ];

        let progress: ReviewProgressState = {
            topics: {},
        };

        expect(moduleCompleteFromProgress(progress, topics)).toBe(false);
        expect(getModuleProgress(topics, progress)).toEqual({
            total: 2,
            done: 0,
            pct: 0,
        });

        progress = buildMarkCardDoneProgress(progress, topicAId, topicACards[0]);
        progress = buildQuizPassProgress(progress, topicAId, "quiz-a");

        expect(isTopicComplete(topicACards, progressTopic(progress, topicAId), topicAId)).toBe(true);
        expect(isTopicComplete(topicBCards, progressTopic(progress, topicBId), topicBId)).toBe(false);

        expect(moduleCompleteFromProgress(progress, topics)).toBe(false);
        expect(getModuleProgress(topics, progress)).toEqual({
            total: 2,
            done: 1,
            pct: 0.5,
        });

        progress = buildMarkCardDoneProgress(progress, topicBId, topicBCards[0]);
        progress = buildQuizPassProgress(progress, topicBId, "quiz-b");

        expect(isTopicComplete(topicBCards, progressTopic(progress, topicBId), topicBId)).toBe(true);

        expect(moduleCompleteFromProgress(progress, topics)).toBe(true);
        expect(getModuleProgress(topics, progress)).toEqual({
            total: 2,
            done: 2,
            pct: 1,
        });
    });

    it("resetting the final quiz makes the topic and module incomplete again", () => {
        const topicId = "input-and-type-conversion";

        const cards = [
            card({ id: "read-intro", type: "text" }),
            card({ id: "profile-line", type: "quiz" }),
        ];

        const topics = [topic(topicId, cards)];

        let progress: ReviewProgressState = {
            topics: {},
        };

        progress = buildMarkCardDoneProgress(progress, topicId, cards[0]);
        progress = buildQuizPassProgress(progress, topicId, "profile-line");

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(true);
        expect(moduleCompleteFromProgress(progress, topics)).toBe(true);

        progress = buildQuizResetProgress(progress, topicId, "profile-line");

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);
        expect(moduleCompleteFromProgress(progress, topics)).toBe(false);
    });

    it("renders no continue CTA while the topic is incomplete", () => {
        const html = renderToStaticMarkup(
            <ReviewTopicCompletion
                viewIsComplete={false}
                viewTopic={{
                    id: "input-and-type-conversion",
                    label: "Input and conversion",
                }}
                onContinue={vi.fn()}
                continueLabel="Next topic"
                showSubjectFinish={false}
                subjectSlug="python-v2"
                subjectFinish={null}
                onOpenCertificate={vi.fn()}
            />,
        );

        expect(html).not.toContain("Next topic");
        expect(html).not.toContain("Next module");
        expect(html).not.toContain("Unlock next");
    });

    it("renders exactly one Next topic CTA when the current topic is complete and a next topic exists", () => {
        const html = renderToStaticMarkup(
            <ReviewTopicCompletion
                viewIsComplete={true}
                viewTopic={{
                    id: "input-and-type-conversion",
                    label: "Input and conversion",
                    outro: {
                        title: "Nice — topic complete",
                        body: "You finished this topic.",
                    },
                }}
                onContinue={vi.fn()}
                continueLabel="Next topic"
                showSubjectFinish={false}
                subjectSlug="python-v2"
                subjectFinish={null}
                onOpenCertificate={vi.fn()}
            />,
        );

        const matches = html.match(/Next topic/g) ?? [];

        expect(matches).toHaveLength(1);
        expect(html).toContain("Nice");
        expect(html).toContain("topic complete");
    });

    it("renders exactly one Next module CTA when the module is complete and a next module exists", () => {
        const html = renderToStaticMarkup(
            <ReviewTopicCompletion
                viewIsComplete={true}
                viewTopic={{
                    id: "input-and-type-conversion",
                    label: "Input and conversion",
                }}
                onContinue={vi.fn()}
                continueLabel="Next module"
                showSubjectFinish={false}
                subjectSlug="python-v2"
                subjectFinish={null}
                onOpenCertificate={vi.fn()}
            />,
        );

        const matches = html.match(/Next module/g) ?? [];

        expect(matches).toHaveLength(1);
    });

    it("does not render a continue CTA when complete but no continue action is provided", () => {
        const html = renderToStaticMarkup(
            <ReviewTopicCompletion
                viewIsComplete={true}
                viewTopic={{
                    id: "input-and-type-conversion",
                    label: "Input and conversion",
                }}
                onContinue={undefined}
                continueLabel="Next topic"
                showSubjectFinish={false}
                subjectSlug="python-v2"
                subjectFinish={null}
                onOpenCertificate={vi.fn()}
            />,
        );

        expect(html).not.toContain("Next topic");
    });



    it("resetting a completed module removes all sidebar green checks even after navigating back and forth", () => {
        const topicAId = "setup-and-first-python";
        const topicBId = "values-and-expressions";

        const topicACards = [
            card({ id: "read-a", type: "text" }),
            card({ id: "quiz-a", type: "quiz" }),
        ];

        const topicBCards = [
            card({ id: "read-b", type: "text" }),
            card({ id: "quiz-b", type: "quiz" }),
        ];

        const topics = [
            topic(topicAId, topicACards),
            topic(topicBId, topicBCards),
        ];

        let progress: ReviewProgressState = {
            topics: {},
            activeTopicId: topicBId,
            moduleCompleted: true,
            moduleCompletedAt: "2026-05-16T12:00:00.000Z",
        };

        progress = buildMarkCardDoneProgress(progress, topicAId, topicACards[0]);
        progress = buildQuizPassProgress(progress, topicAId, "quiz-a");

        progress = buildMarkCardDoneProgress(progress, topicBId, topicBCards[0]);
        progress = buildQuizPassProgress(progress, topicBId, "quiz-b");

        expect(moduleCompleteFromProgress(progress, topics)).toBe(true);

        const sidebarBeforeReset = getSidebarTopicItems({
            topics,
            activeIdx: 1,
            activeTopicId: topicBId,
            viewTopicId: topicBId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress,
        });

        expect(sidebarBeforeReset.map((item) => item.done)).toEqual([true, true]);

        progress = buildResetModuleProgress(progress, topicAId);

        expect(progress.moduleCompleted).toBe(false);
        expect(progress.moduleCompletedAt).toBeUndefined();
        expect(progress.activeTopicId).toBe(topicAId);
        expect(progress.topics).toEqual({});

        expect(moduleCompleteFromProgress(progress, topics)).toBe(false);
        expect(getModuleProgress(topics, progress)).toEqual({
            total: 2,
            done: 0,
            pct: 0,
        });

        const sidebarAfterResetOnFirstTopic = getSidebarTopicItems({
            topics,
            activeIdx: 0,
            activeTopicId: topicAId,
            viewTopicId: topicAId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress,
        });

        expect(sidebarAfterResetOnFirstTopic.map((item) => item.done)).toEqual([
            false,
            false,
        ]);

        const sidebarAfterNavigatingForward = getSidebarTopicItems({
            topics,
            activeIdx: 1,
            activeTopicId: topicAId,
            viewTopicId: topicBId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress,
        });

        expect(sidebarAfterNavigatingForward.map((item) => item.done)).toEqual([
            false,
            false,
        ]);

        const sidebarAfterNavigatingBack = getSidebarTopicItems({
            topics,
            activeIdx: 0,
            activeTopicId: topicAId,
            viewTopicId: topicAId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress,
        });

        expect(sidebarAfterNavigatingBack.map((item) => item.done)).toEqual([
            false,
            false,
        ]);
    });

    it("resetting one completed topic removes only that topic green check and keeps other completed topics done", () => {
        const topicAId = "setup-and-first-python";
        const topicBId = "values-and-expressions";

        const topicACards = [
            card({ id: "read-a", type: "text" }),
            card({ id: "quiz-a", type: "quiz" }),
        ];

        const topicBCards = [
            card({ id: "read-b", type: "text" }),
            card({ id: "quiz-b", type: "quiz" }),
        ];

        const topics = [
            topic(topicAId, topicACards),
            topic(topicBId, topicBCards),
        ];

        let progress: ReviewProgressState = {
            topics: {},
            moduleCompleted: true,
            moduleCompletedAt: "2026-05-16T12:00:00.000Z",
        };

        progress = buildMarkCardDoneProgress(progress, topicAId, topicACards[0]);
        progress = buildQuizPassProgress(progress, topicAId, "quiz-a");

        progress = buildMarkCardDoneProgress(progress, topicBId, topicBCards[0]);
        progress = buildQuizPassProgress(progress, topicBId, "quiz-b");

        expect(moduleCompleteFromProgress(progress, topics)).toBe(true);

        progress = buildResetTopicProgress(progress, topicAId);

        expect(progress.moduleCompleted).toBe(false);
        expect(progress.moduleCompletedAt).toBeUndefined();

        expect(isTopicComplete(topicACards, progressTopic(progress, topicAId), topicAId)).toBe(false);
        expect(isTopicComplete(topicBCards, progressTopic(progress, topicBId), topicBId)).toBe(true);

        expect(getModuleProgress(topics, progress)).toEqual({
            total: 2,
            done: 1,
            pct: 0.5,
        });

        const sidebarAfterReset = getSidebarTopicItems({
            topics,
            activeIdx: 1,
            activeTopicId: topicBId,
            viewTopicId: topicAId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress,
        });

        expect(sidebarAfterReset.map((item) => item.done)).toEqual([false, true]);
    });
    it("does not show a green check from stale completed flags when card-level completion was cleared", () => {
        const topicId = "setup-and-first-python";

        const cards = [
            card({ id: "read-intro", type: "text" }),
            card({ id: "quiz-final", type: "quiz" }),
        ];

        const topics = [topic(topicId, cards)];

        const staleProgress: ReviewProgressState = {
            moduleCompleted: true,
            moduleCompletedAt: "2026-05-16T12:00:00.000Z",
            topics: {
                [topicId]: {
                    completed: true,
                    completedAt: "2026-05-16T12:00:00.000Z",
                    cardsDone: {},
                    readingDone: {},
                    quizzesDone: {},
                    quizState: {},
                },
            },
        };

        expect(isTopicComplete(cards, progressTopic(staleProgress, topicId), topicId)).toBe(false);
        expect(moduleCompleteFromProgress(staleProgress, topics)).toBe(false);

        const sidebarItems = getSidebarTopicItems({
            topics,
            activeIdx: 0,
            activeTopicId: topicId,
            viewTopicId: topicId,
            topicUnlocked: () => true,
            unlockAll: false,
            progressHydrated: true,
            progress: staleProgress,
        });

        expect(sidebarItems[0]?.done).toBe(false);
    });
    it("resetting one quiz clears only that quiz completion and runtime, not unrelated quiz/card progress", () => {
        const topicId = "setup-and-first-python";

        const cards = [
            card({ id: "read-intro", type: "text" }),
            card({ id: "quiz-a", type: "quiz" }),
            card({ id: "quiz-b", type: "quiz" }),
        ];

        const topics = [topic(topicId, cards)];

        let progress: ReviewProgressState = {
            topics: {
                [topicId]: {
                    readingDone: {
                        "read-intro": true,
                    },
                    cardsDone: {
                        "read-intro": true,
                    },
                    quizzesDone: {
                        "quiz-a": true,
                        "quiz-b": true,
                    },
                    quizState: {
                        "quiz-a": {
                            answers: { q1: "old answer" },
                        } as any,
                        "quiz-b": {
                            answers: { q2: "keep this answer" },
                        } as any,
                    },
                    runtimeStateV2: {
                        exercises: {
                            "exercise-for-quiz-a": {
                                cardId: "quiz-a",
                                code: "print('remove me')",
                            },
                            "exercise-for-quiz-b": {
                                cardId: "quiz-b",
                                code: "print('keep me')",
                            },
                        },
                        cards: {
                            "tool-for-quiz-a": {
                                cardId: "quiz-a",
                            },
                            "tool-for-quiz-b": {
                                cardId: "quiz-b",
                            },
                        },
                    },
                    completed: true,
                    completedAt: "2026-05-16T12:00:00.000Z",
                } as any,
            },
            moduleCompleted: true,
            moduleCompletedAt: "2026-05-16T12:00:00.000Z",
        };

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(true);
        expect(moduleCompleteFromProgress(progress, topics)).toBe(true);

        progress = buildQuizResetProgress(progress, topicId, "quiz-a");

        const nextTopic = progress.topics?.[topicId] as any;

        expect(progress.moduleCompleted).toBe(false);
        expect(progress.moduleCompletedAt).toBeUndefined();

        expect(nextTopic.quizzesDone["quiz-a"]).toBeUndefined();
        expect(nextTopic.quizzesDone["quiz-b"]).toBe(true);

        expect(nextTopic.quizState["quiz-a"]).toBeUndefined();
        expect(nextTopic.quizState["quiz-b"]).toEqual({
            answers: { q2: "keep this answer" },
        });

        expect(nextTopic.runtimeStateV2.exercises["exercise-for-quiz-a"]).toBeUndefined();
        expect(nextTopic.runtimeStateV2.cards["tool-for-quiz-a"]).toBeUndefined();

        expect(nextTopic.runtimeStateV2.exercises["exercise-for-quiz-b"]).toEqual({
            cardId: "quiz-b",
            code: "print('keep me')",
        });

        expect(nextTopic.runtimeStateV2.cards["tool-for-quiz-b"]).toEqual({
            cardId: "quiz-b",
        });

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);
    });
    it("resetting an already-reset module stays clean and does not crash", () => {
        const topicId = "setup-and-first-python";

        let progress: ReviewProgressState = {
            topics: {},
            activeTopicId: topicId,
            moduleCompleted: false,
        };

        progress = buildResetModuleProgress(progress, topicId);
        progress = buildResetModuleProgress(progress, topicId);

        expect(progress.moduleCompleted).toBe(false);
        expect(progress.moduleCompletedAt).toBeUndefined();
        expect(progress.activeTopicId).toBe(topicId);
        expect(progress.topics).toEqual({});
    });

    it("resetting an already-reset topic stays clean and preserves unrelated topics", () => {
        const topicAId = "setup-and-first-python";
        const topicBId = "values-and-expressions";

        let progress: ReviewProgressState = {
            topics: {
                [topicBId]: {
                    readingDone: { "read-b": true },
                    cardsDone: { "read-b": true },
                    quizzesDone: { "quiz-b": true },
                },
            },
            moduleCompleted: false,
        };

        progress = buildResetTopicProgress(progress, topicAId);
        progress = buildResetTopicProgress(progress, topicAId);

        expect(progress.moduleCompleted).toBe(false);
        expect(progress.moduleCompletedAt).toBeUndefined();

        expect(progress.topics?.[topicAId]?.readingDone ?? {}).toEqual({});
        expect(progress.topics?.[topicAId]?.cardsDone ?? {}).toEqual({});
        expect(progress.topics?.[topicAId]?.quizzesDone ?? {}).toEqual({});

        expect(progress.topics?.[topicBId]?.readingDone?.["read-b"]).toBe(true);
        expect(progress.topics?.[topicBId]?.cardsDone?.["read-b"]).toBe(true);
        expect(progress.topics?.[topicBId]?.quizzesDone?.["quiz-b"]).toBe(true);
    });

});
