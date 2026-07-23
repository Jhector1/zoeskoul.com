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

function renderStage(card: any, desktopToolsVisible = false) {
    return renderToStaticMarkup(
        React.createElement(ReviewTopicStage, {
            leftCollapsedEff: false,
            desktopToolsVisible,
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
    it("centers the lesson column whenever desktop Tools are not visible", () => {
        const html = renderStage({
            type: "sketch",
            id: "sketch0",
            title: "Question walkthrough",
            sketchId: "recurrence-walkthrough",
        });

        expect(html).toContain("mx-auto w-full max-w-4xl");
    });

    it("keeps the split-workspace width while desktop Tools are visible", () => {
        const html = renderStage(
            {
                type: "sketch",
                id: "sketch1",
                title: "Embedded editor walkthrough",
                sketchId: "try-it-sketch",
            },
            true,
        );

        expect(html).not.toContain("max-w-4xl");
    });

    it("uses shell visibility instead of card-local tool metadata", () => {
        const html = renderStage(
            {
                type: "sketch",
                id: "sketch2",
                title: "Hidden tools policy",
                sketchId: "plain-sketch",
                tools: {
                    defaultVisible: false,
                    allowOpen: false,
                },
            },
            true,
        );

        expect(html).not.toContain("max-w-4xl");
    });
});
