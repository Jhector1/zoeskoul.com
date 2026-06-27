import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewTopicStage from "./ReviewTopicStage";

vi.mock("@/lib/config/learnerUiFlags", () => ({
    learnerUiFlags: {
        compactLearnerUi: false,
        showDebugLearningUi: false,
    },
}));

vi.mock("../../components/TopicShell", () => ({
    default: ({ children }: { children: React.ReactNode }) =>
        React.createElement("div", { "data-testid": "topic-shell" }, children),
}));

vi.mock("./ReviewTopicCards", () => ({
    default: () => React.createElement("div", { "data-testid": "topic-cards" }),
}));

vi.mock("./ReviewTopicCompletion", () => ({
    default: () => React.createElement("div", { "data-testid": "topic-completion" }),
}));

function renderStage(card: any) {
    return renderToStaticMarkup(
        React.createElement(ReviewTopicStage, {
            leftCollapsedEff: false,
            onOpenTopics: vi.fn(),
            mainScrollRef: { current: null },
            padStyle: {},
            viewTopic: { id: "topic-1", label: "Topic", cards: [card] } as any,
            viewCards: [card],
            viewTid: "topic-1",
            activeCardIndex: 0,
            navModes: { cards: "scroll", quiz: "scroll" },
            reduceMotion: true,
            tp: {} as any,
            progressHydrated: true,
            versionStr: "v1",
            prereqsForAllQuizzes: true,
            sketch: {} as any,
            setProgress: vi.fn(),
            flushNow: vi.fn(),
            scrollToNextActionable: vi.fn(),
            setCardEl: vi.fn(() => vi.fn()),
            viewIsComplete: false,
            showSubjectFinish: false,
            subjectSlug: "sql-v2",
            moduleSlug: "sql-v2-0",
            subjectFinish: null,
            onOpenCertificate: vi.fn(),
        }),
    );
}

describe("ReviewTopicStage width constraints", () => {
    it("constrains hidden-tools sketch cards even outside compact learner mode", () => {
        const html = renderStage({
            type: "sketch",
            id: "sketch0",
            title: "Sketch",
            sketchId: "what-sql-means",
            tools: {
                defaultVisible: false,
                allowOpen: false,
            },
        });

        expect(html).toContain("max-w-4xl");
    });

    it("does not constrain normal sketch cards when tools are available", () => {
        const html = renderStage({
            type: "sketch",
            id: "sketch1",
            title: "Sketch",
            sketchId: "try-it-sketch",
            tools: {
                defaultVisible: true,
                allowOpen: true,
            },
        });

        expect(html).not.toContain("max-w-4xl");
    });
});
