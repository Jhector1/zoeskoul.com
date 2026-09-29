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

    it("still auto-opens a registry-backed code workspace", () => {
        expect(
            resolveToolsRailVisibility({
                ...baseArgs,
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
