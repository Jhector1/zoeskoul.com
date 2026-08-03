import { describe, expect, it } from "vitest";

import {
    shouldDefaultCollapseReviewSidebar,
    shouldResetManualPanelChoice,
} from "./useReviewPanels";

describe("shouldDefaultCollapseReviewSidebar", () => {
    it("defaults to collapsed for compact learner mode on laptop-width desktop", () => {
        expect(
            shouldDefaultCollapseReviewSidebar({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                showDesktopLeft: true,
                wideDesktopUp: false,
            }),
        ).toBe(true);
    });

    it("keeps the sidebar open by default on wide desktop", () => {
        expect(
            shouldDefaultCollapseReviewSidebar({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                showDesktopLeft: true,
                wideDesktopUp: true,
            }),
        ).toBe(false);
    });

    it("preserves legacy behavior outside compact learner mode", () => {
        expect(
            shouldDefaultCollapseReviewSidebar({
                compactLearnerUi: false,
                showDebugLearningUi: false,
                showDesktopLeft: true,
                wideDesktopUp: false,
            }),
        ).toBe(false);
    });
});

describe("shouldResetManualPanelChoice", () => {
    it("resets the manual tools-rail choice when the active card scope changes", () => {
        expect(
            shouldResetManualPanelChoice(
                "card::topic-1::quiz-1::collapsed",
                "card::topic-1::text-2::open",
            ),
        ).toBe(true);
    });

    it("keeps the manual choice for the same card scope", () => {
        expect(
            shouldResetManualPanelChoice(
                "card::topic-1::quiz-1::collapsed",
                "card::topic-1::quiz-1::collapsed",
            ),
        ).toBe(false);
    });
});
