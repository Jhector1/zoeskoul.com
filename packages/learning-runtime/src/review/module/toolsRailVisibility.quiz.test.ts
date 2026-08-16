import { describe, expect, it } from "vitest";

import { resolveToolsRailVisibility } from "./toolsRailVisibility";

const pureQuiz = {
    type: "quiz",
    id: "quiz-1",
    title: "Order a Safe Data Change",
    spec: {
        subject: "sql-data-management",
    },
} as any;

const baseArgs = {
    routeTargetKind: "card",
    routeTargetTargetKind: "quiz",
    cardHasEmbeddedTryIt: false,
    hasWorkspaceExercise: false,
    hasRegistryWorkspaceExercise: false,
};

describe("quiz Tools ownership", () => {
    it("ignores inherited topic defaultVisible=true for a pure quiz", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: pureQuiz,
                topicTools: {
                    defaultVisible: true,
                    allowOpen: true,
                },
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
            isQuizCard: true,
            isExerciseBound: false,
        });
    });

    it("keeps Tools manually available for a pure quiz", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: pureQuiz,
                topicTools: {
                    defaultVisible: true,
                    allowOpen: true,
                },
            }),
        ).toMatchObject({
            allowOpen: true,
            isAvailable: true,
        });
    });

    it("honors an explicit card-level request to open Tools for a quiz", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: {
                    ...pureQuiz,
                    tools: {
                        defaultVisible: true,
                    },
                },
                topicTools: {
                    defaultVisible: false,
                    allowOpen: true,
                },
            }),
        ).toMatchObject({
            defaultVisible: true,
            shouldCollapseByDefault: false,
        });
    });

    it("opens a quiz that is genuinely workspace-exercise-bound", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: pureQuiz,
                topicTools: {
                    defaultVisible: false,
                    allowOpen: true,
                },
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: true,
            isExerciseBound: true,
            shouldCollapseByDefault: false,
        });
    });

    it("honors an explicit exercise-level hide for an exercise-bound quiz", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                activeCard: pureQuiz,
                hasRegistryWorkspaceExercise: true,
                topicTools: {
                    defaultVisible: true,
                    allowOpen: true,
                },
                exerciseTools: {
                    defaultVisible: false,
                },
            }),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
            isExerciseBound: true,
        });
    });
});
