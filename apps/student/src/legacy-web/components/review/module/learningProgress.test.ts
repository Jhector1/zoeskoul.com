import { describe, expect, it } from "vitest";

import {
    buildLearningProgressSteps,
    clampLearningProgressIndex,
    resolveLearningActivityLabel,
    shouldUseNestedLearningProgress,
} from "./learningProgress";

describe("learning progress", () => {
    it("clamps the active index to the available steps", () => {
        expect(clampLearningProgressIndex(-3, 4)).toBe(0);
        expect(clampLearningProgressIndex(8, 4)).toBe(3);
        expect(clampLearningProgressIndex(2, 4)).toBe(2);
    });

    it("keeps authored completion states while marking the current step", () => {
        expect(
            buildLearningProgressSteps({
                label: "Capstone step",
                activeIndex: 1,
                total: 4,
                statuses: ["complete", "upcoming", "upcoming", "revealed"],
            }),
        ).toEqual([
            { index: 0, status: "complete", current: false },
            { index: 1, status: "upcoming", current: true },
            { index: 2, status: "upcoming", current: false },
            { index: 3, status: "revealed", current: false },
        ]);
    });

    it("uses capstone, project, quiz, and card labels from the active context", () => {
        expect(
            resolveLearningActivityLabel({
                kind: "project",
                identifyingText: "Final Capstone: Executive Report",
            }),
        ).toBe("Capstone step");
        expect(resolveLearningActivityLabel({ kind: "project" })).toBe("Project step");
        expect(resolveLearningActivityLabel({ kind: "quiz" })).toBe("Question");
        expect(resolveLearningActivityLabel({ kind: "card" })).toBe("Lesson");
    });

    it("keeps embedded Try It progress inside the current card", () => {
        expect(shouldUseNestedLearningProgress("embedded_try_it")).toBe(false);
        expect(shouldUseNestedLearningProgress("quiz")).toBe(true);
        expect(shouldUseNestedLearningProgress("project")).toBe(true);
        expect(shouldUseNestedLearningProgress(undefined)).toBe(false);
    });
});
