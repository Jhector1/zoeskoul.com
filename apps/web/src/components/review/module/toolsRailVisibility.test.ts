import { describe, expect, it } from "vitest";

import { shouldDefaultCollapseToolsRailForCompactQuiz } from "./toolsRailVisibility";

describe("shouldDefaultCollapseToolsRailForCompactQuiz", () => {
    it("collapses the tools rail for compact quiz cards by default", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "quiz",
                    id: "quiz-1",
                    title: "Quiz",
                    spec: { subject: "python-v2" },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(true);
    });

    it("keeps tools visible for sketch try-it cards", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "sketch",
                    id: "sketch-1",
                    title: "Sketch",
                    sketchId: "sketch-1",
                    tryIt: {
                        id: "try-1",
                        exerciseKey: "try-1",
                        spec: {
                            mode: "project",
                            subject: "python-v2",
                            steps: [],
                        },
                    },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: true,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });

    it("keeps tools visible for text cards with embedded try-it", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "text",
                    id: "text-1",
                    title: "Lesson",
                    markdown: "Intro",
                    tryIt: {
                        id: "try-1",
                        exerciseKey: "try-1",
                        spec: {
                            mode: "project",
                            subject: "python-v2",
                            steps: [],
                        },
                    },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: true,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });

    it("keeps tools visible for project cards", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "project",
                    id: "project-1",
                    title: "Project",
                    spec: {
                        mode: "project",
                        subject: "python-v2",
                        steps: [],
                    },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });

    it("preserves old behavior outside compact mode", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: false,
                showDebugLearningUi: false,
                activeCard: {
                    type: "quiz",
                    id: "quiz-1",
                    title: "Quiz",
                    spec: { subject: "python-v2" },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });

    it("preserves debug behavior for quiz cards", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: true,
                activeCard: {
                    type: "quiz",
                    id: "quiz-1",
                    title: "Quiz",
                    spec: { subject: "python-v2" },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });
});
