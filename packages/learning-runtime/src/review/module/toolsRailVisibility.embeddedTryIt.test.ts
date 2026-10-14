import { describe, expect, it } from "vitest";

import { resolveToolsRailVisibility } from "./toolsRailVisibility";

const embeddedTryItCard = {
    type: "sketch",
    id: "lesson_s0",
    title: "Lesson",
    tryIt: {
        id: "try-1",
        exerciseKey: "exercise-1",
        spec: {
            mode: "project",
            subject: "test",
            steps: [],
        },
    },
} as any;

const baseArgs = {
    activeCard: embeddedTryItCard,
    topicTools: null,
    exerciseTools: null,
    routeTargetKind: "card",
    routeTargetTargetKind: "sketch",
    cardHasEmbeddedTryIt: true,
    hasWorkspaceExercise: false,
    hasRegistryWorkspaceExercise: false,
};

describe("embedded Try It Tools visibility", () => {
    it("keeps non-workspace Try It closed until the learner opens Tools", () => {
        expect(
            resolveToolsRailVisibility(baseArgs),
        ).toMatchObject({
            defaultVisible: false,
            allowOpen: true,
            isAvailable: true,
            shouldCollapseByDefault: true,
            isExerciseBound: false,
        });
    });

    it("does not inherit topic auto-open into a non-workspace Try It", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
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
            isExerciseBound: false,
        });
    });

    it("keeps a registry-backed Try It closed on its reading card", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: false,
            isAvailable: true,
            shouldCollapseByDefault: true,
            isExerciseBound: true,
        });
    });

    it("opens the registry-backed code workspace on the exercise route", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                routeTargetKind: "exercise",
                routeTargetTargetKind: "exercise",
                hasRegistryWorkspaceExercise: true,
            }),
        ).toMatchObject({
            defaultVisible: true,
            isAvailable: true,
            shouldCollapseByDefault: false,
            isExerciseBound: true,
        });
    });

    it("still honors an explicit hide on a code workspace", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
                hasRegistryWorkspaceExercise: true,
                exerciseTools: {
                    defaultVisible: false,
                    allowOpen: true,
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
