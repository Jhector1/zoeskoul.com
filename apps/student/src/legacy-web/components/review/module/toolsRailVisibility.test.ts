import { describe, expect, it } from "vitest";

import {
    resolveToolsRailVisibility,
    shouldDefaultCollapseToolsRail,
    shouldDefaultCollapseToolsRailForCompactQuiz,
    toolPresentationPolicyFromManifest,
    toolPresentationPolicyFromTopic,
} from "@zoeskoul/learning-runtime/review/module/toolsRailVisibility";

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
    hasRegistryWorkspaceExercise: false,
};

describe("toolPresentationPolicyFromManifest", () => {
    it("returns a normalized policy from a runtime manifest record", () => {
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

describe("toolPresentationPolicyFromTopic", () => {
    it("prefers the materialized inherited topic policy", () => {
        expect(
            toolPresentationPolicyFromTopic({
                id: "topic-1",
                label: "Topic",
                cards: [],
                meta: {
                    tools: { defaultVisible: true, allowOpen: true },
                    rawManifest: {
                        tools: { defaultVisible: false },
                    },
                },
            }),
        ).toEqual({ defaultVisible: true, allowOpen: true });
    });

    it("falls back to a raw topic override for older frozen snapshots", () => {
        expect(
            toolPresentationPolicyFromTopic({
                id: "topic-1",
                label: "Topic",
                cards: [],
                meta: {
                    rawManifest: {
                        tools: { defaultVisible: true },
                    },
                },
            }),
        ).toEqual({ defaultVisible: true });
    });
});

describe("resolveToolsRailVisibility", () => {
    it("keeps a non-exercise workspace available but closed by default", () => {
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
            isExerciseBound: false,
        });
    });

    it("opens a non-exercise workspace when an inherited policy explicitly requests it", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: readingSketch,
                topicTools: {
                    defaultVisible: true,
                    allowOpen: true,
                },
            }),
        ).toMatchObject({
            defaultVisible: true,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: false,
            isExerciseBound: false,
        });
    });

    it("opens embedded try-it and registry-backed exercise workspaces by default", () => {
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
            isExerciseBound: true,
        });

        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: readingSketch,
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: true,
            isExerciseBound: true,
        });
    });

    it("does not open Tools for a non-workspace exercise route", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    type: "quiz",
                    id: "quiz-1",
                    title: "Quiz",
                    spec: {
                        subject: "c-data-structures",
                    },
                },
                routeTargetKind: "exercise",
                routeTargetTargetKind: "exercise",
            }),
        ).toMatchObject({
            isExerciseTarget: true,
            isExerciseBound: false,
            defaultVisible: false,
        });
    });

    it("opens a project only when it has an exercise-bound workspace", () => {
        const projectCard = {
            type: "project" as const,
            id: "project-1",
            title: "Project",
            spec: {
                mode: "project" as const,
                subject: "python-v2",
                steps: [],
            },
        };

        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: projectCard,
            }),
        ).toMatchObject({
            defaultVisible: false,
            isExerciseBound: false,
        });

        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: projectCard,
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: true,
            isAvailable: true,
            isExerciseBound: true,
        });
    });

    it("lets an explicit policy hide or remove an exercise workspace", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    type: "project",
                    id: "project-1",
                    title: "Project",
                    spec: {
                        mode: "project",
                        subject: "sql-v2",
                        steps: [],
                    },
                },
                exerciseTools: {
                    defaultVisible: false,
                },
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
        });

        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    type: "project",
                    id: "project-1",
                    title: "Project",
                    spec: {
                        mode: "project",
                        subject: "sql-v2",
                        steps: [],
                    },
                },
                exerciseTools: {
                    defaultVisible: false,
                    allowOpen: false,
                },
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: false,
            isAvailable: false,
        });
    });

    it("merges topic, card, and exercise policy by specificity", () => {
        const visibility = resolveToolsRailVisibility({
            ...baseArgs,
            topicTools: { defaultVisible: false, allowOpen: true },
            activeCard: {
                ...readingSketch,
                tools: { defaultVisible: true },
            },
            exerciseTools: { defaultVisible: false, allowOpen: false },
            hasRegistryWorkspaceExercise: true,
        });

        expect(visibility.effectiveTools).toEqual({
            defaultVisible: false,
            allowOpen: false,
        });
        expect(visibility).toMatchObject({
            defaultVisible: false,
            allowOpen: false,
            isAvailable: false,
        });
    });

    it("allows a lower-level policy to reopen a parent-hidden workspace", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                topicTools: { defaultVisible: false, allowOpen: false },
                activeCard: {
                    ...readingSketch,
                    tools: { defaultVisible: true, allowOpen: true },
                },
            }),
        ).toMatchObject({
            defaultVisible: true,
            allowOpen: true,
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

    it("does not collapse an exercise-bound workspace", () => {
        expect(
            shouldDefaultCollapseToolsRail({
                ...baseArgs,
                activeCard: readingSketch,
                hasRegistryWorkspaceExercise: true,
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
