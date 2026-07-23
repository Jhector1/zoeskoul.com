import { describe, expect, it } from "vitest";

import {
    resolveToolsRailVisibility,
    shouldDefaultCollapseToolsRail,
    shouldDefaultCollapseToolsRailForCompactQuiz,
    toolPresentationPolicyFromManifest,
} from "./toolsRailVisibility";

const readingSketch = {
    type: "sketch" as const,
    id: "sketch-1",
    title: "Sketch",
    sketchId: "sketch-1",
};

const baseArgs = {
    routeTargetKind: "card",
    routeTargetTargetKind: "sketch",
    cardHasEmbeddedTryIt: false,
    hasWorkspaceExercise: false,
};

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
    });
});

describe("resolveToolsRailVisibility", () => {
    it("keeps a reusable workspace available but hidden on reading cards", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: readingSketch,
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
            inferredNeedsTools: false,
        });
    });

    it("opens the workspace for an embedded try-it in every course profile", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    ...readingSketch,
                    tryIt: {
                        id: "try-1",
                        exerciseKey: "try-1",
                        spec: {
                            mode: "project",
                            subject: "c-data-structures",
                            steps: [],
                        },
                    },
                },
                cardHasEmbeddedTryIt: true,
            }),
        ).toMatchObject({
            defaultVisible: true,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: false,
            inferredNeedsTools: true,
        });
    });

    it("opens the workspace for project cards", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
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
            }),
        ).toMatchObject({
            defaultVisible: true,
            isAvailable: true,
            inferredNeedsTools: true,
        });
    });

    it("removes the rail only when authors explicitly hide and disallow it", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    ...readingSketch,
                    tools: {
                        defaultVisible: false,
                        allowOpen: false,
                    },
                },
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: false,
            isAvailable: false,
            shouldCollapseByDefault: true,
        });
    });

    it("keeps exercise routes available even under an outer hidden policy", () => {
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
            ...baseArgs,
            topicTools: { defaultVisible: false, allowOpen: true },
            activeCard: {
                ...readingSketch,
                tools: { defaultVisible: true },
            },
            exerciseTools: { allowOpen: false },
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

describe("shouldDefaultCollapseToolsRail", () => {
    it("collapses ordinary reading cards in compact and standard layouts", () => {
        expect(
            shouldDefaultCollapseToolsRail({
                ...baseArgs,
                activeCard: readingSketch,
                showDebugLearningUi: false,
            }),
        ).toBe(true);

        expect(
            shouldDefaultCollapseToolsRailForCompactQuiz({
                ...baseArgs,
                activeCard: readingSketch,
                compactLearnerUi: false,
                showDebugLearningUi: false,
            }),
        ).toBe(true);
    });

    it("does not collapse an embedded try-it", () => {
        expect(
            shouldDefaultCollapseToolsRail({
                ...baseArgs,
                activeCard: readingSketch,
                cardHasEmbeddedTryIt: true,
                showDebugLearningUi: false,
            }),
        ).toBe(false);
    });

    it("keeps Tools open in debug UI", () => {
        expect(
            shouldDefaultCollapseToolsRail({
                ...baseArgs,
                activeCard: readingSketch,
                showDebugLearningUi: true,
            }),
        ).toBe(false);
    });
});
