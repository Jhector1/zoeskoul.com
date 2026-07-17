import { describe, expect, it } from "vitest";

import {
    resolveToolsRailVisibility,
    shouldDefaultCollapseToolsRailForCompactQuiz,
    toolPresentationPolicyFromManifest,
} from "./toolsRailVisibility";

describe("toolPresentationPolicyFromManifest", () => {
    it("returns a typed policy from a runtime manifest record", () => {
        expect(
            toolPresentationPolicyFromManifest({
                kind: "code_input",
                tools: {
                    defaultVisible: false,
                    allowOpen: true,
                    defaultSurface: "results",
                    sqlPane: {
                        defaultTab: "tables",
                    },
                },
            }),
        ).toEqual({
            defaultVisible: false,
            allowOpen: true,
            defaultSurface: "results",
            sqlPane: {
                defaultTab: "tables",
            },
        });
    });

    it("ignores missing or malformed runtime policy values", () => {
        expect(toolPresentationPolicyFromManifest(null)).toBeNull();
        expect(toolPresentationPolicyFromManifest("manifest")).toBeNull();
        expect(
            toolPresentationPolicyFromManifest({
                tools: "results",
            }),
        ).toBeNull();
        expect(
            toolPresentationPolicyFromManifest({
                tools: ["results"],
            }),
        ).toBeNull();
    });
});

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

    it("honors explicit tools.defaultVisible=false on non-quiz cards", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "sketch",
                    id: "sketch-1",
                    title: "Sketch",
                    sketchId: "sketch-1",
                    tools: {
                        defaultVisible: false,
                        allowOpen: true,
                    },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(true);
    });

    it("honors explicit tools.defaultVisible=true on sketch cards", () => {
        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                compactLearnerUi: true,
                showDebugLearningUi: false,
                activeCard: {
                    type: "sketch",
                    id: "sketch-1",
                    title: "Sketch",
                    sketchId: "sketch-1",
                    tools: {
                        defaultVisible: true,
                        allowOpen: true,
                    },
                },
                routeTargetKind: "card",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toBe(false);
    });

    it("keeps existing quiz-card default collapsed when tools is not authored", () => {
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

});

describe("resolveToolsRailVisibility", () => {
    it("makes the rail unavailable when a reading card explicitly hides and disallows tools", () => {
        expect(
            resolveToolsRailVisibility({
                activeCard: {
                    type: "sketch",
                    id: "sketch-1",
                    title: "Sketch",
                    sketchId: "sketch-1",
                    tools: {
                        defaultVisible: false,
                        allowOpen: false,
                    },
                },
                routeTargetKind: "card",
                routeTargetTargetKind: "sketch",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: false,
            isAvailable: false,
            shouldCollapseByDefault: true,
        });
    });

    it("keeps the rail available but collapsed when a card hides tools by default and still allows opening", () => {
        expect(
            resolveToolsRailVisibility({
                activeCard: {
                    type: "sketch",
                    id: "sketch-1",
                    title: "Sketch",
                    sketchId: "sketch-1",
                    tools: {
                        defaultVisible: false,
                        allowOpen: true,
                    },
                },
                routeTargetKind: "card",
                routeTargetTargetKind: "sketch",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: false,
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
        });
    });

    it("keeps exercise routes available even when tools were explicitly hidden on the outer card", () => {
        expect(
            resolveToolsRailVisibility({
                activeCard: {
                    type: "project",
                    id: "project-1",
                    title: "Project",
                    tools: {
                        defaultVisible: false,
                        allowOpen: false,
                    },
                    spec: {
                        mode: "project",
                        subject: "sql-v2",
                        steps: [],
                    },
                },
                routeTargetKind: "exercise",
                routeTargetTargetKind: "exercise",
                cardHasEmbeddedTryIt: false,
                hasWorkspaceExercise: true,
            }),
        ).toMatchObject({
            isAvailable: true,
            defaultVisible: false,
            allowOpen: false,
        });
    });
    it("merges topic, lesson, and exercise visibility by specificity", () => {
        const visibility = resolveToolsRailVisibility({
            topicTools: { defaultVisible: false, allowOpen: true },
            activeCard: {
                type: "sketch",
                id: "sketch-1",
                title: "Sketch",
                sketchId: "sketch-1",
                tools: { defaultVisible: true },
            },
            exerciseTools: { allowOpen: false },
            routeTargetKind: "card",
            routeTargetTargetKind: "sketch",
            cardHasEmbeddedTryIt: false,
            hasWorkspaceExercise: false,
        });

        expect(visibility.effectiveTools).toEqual({
            defaultVisible: true,
            allowOpen: false,
        });
        expect(visibility).toMatchObject({
            defaultVisible: true,
            allowOpen: false,
            isAvailable: true,
        });
    });

});
