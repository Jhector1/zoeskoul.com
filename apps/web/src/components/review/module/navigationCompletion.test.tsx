import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";

import {
    buildMarkCardDoneProgress,
    buildQuizPassProgress,
    buildQuizResetProgress,
} from "./actions";

import {
    getModuleProgress,
    moduleCompleteFromProgress,
} from "./selectors";

import {
    countAnswered,
    isTopicComplete,
} from "./utils";

import ReviewTopicCompletion from "./components/content/ReviewTopicCompletion";

type CardOverrides = Partial<ReviewCard> & { id: string };

function card(overrides: CardOverrides): ReviewCard {
    const type = overrides.type ?? "text";

    if (type === "text") {
        return {
            type: "text",
            title: overrides.title ?? overrides.id,
            markdown: "",
            ...overrides,
        } as unknown as ReviewCard;
    }

    if (type === "sketch") {
        return {
            type: "sketch",
            title: overrides.title ?? overrides.id,
            sketchId: overrides.id,
            ...overrides,
        } as unknown as ReviewCard;
    }

    if (type === "quiz") {
        return {
            type: "quiz",
            title: overrides.title ?? overrides.id,
            spec: {},
            ...overrides,
        } as unknown as ReviewCard;
    }

    if (type === "project") {
        return {
            type: "project",
            title: overrides.title ?? overrides.id,
            spec: {},
            ...overrides,
        } as unknown as ReviewCard;
    }

    return {
        type: "video",
        title: overrides.title ?? overrides.id,
        url: "",
        ...overrides,
    } as unknown as ReviewCard;
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
    } as unknown as ReviewModule["topics"][number];
}

function progressTopic(progress: any, topicId: string) {
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

        let progress: any = {
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

        let progress: any = {
            topics: {},
        };

        expect(isTopicComplete(cards, progressTopic(progress, topicId), topicId)).toBe(false);

        progress = buildQuizPassProgress(progress, topicId, "profile-line", cards);

        expect(progress.topics[topicId].readingDone).toMatchObject({
            "read-intro": true,
            "practice-note": true,
        });

        expect(progress.topics[topicId].quizzesDone).toMatchObject({
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

        let progress: any = {
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

        let progress: any = {
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
});