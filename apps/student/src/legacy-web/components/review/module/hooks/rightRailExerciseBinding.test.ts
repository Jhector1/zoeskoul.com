import { describe, expect, it } from "vitest";
import { shouldRightRailUseBoundExercise } from "./rightRailExerciseBinding";

describe("shouldRightRailUseBoundExercise", () => {
    it("uses the bound exercise when the route itself is an exercise", () => {
        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: true,
                activeCard: null,
            }),
        ).toBe(true);
    });

    it("uses the bound exercise for embedded try-it cards with authored steps", () => {
        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: false,
                activeCard: {
                    type: "sketch",
                    id: "topic_s0",
                    title: "Sketch",
                    sketchId: "sk1",
                    tryIt: {
                        id: "try-topic-sketch0",
                        exerciseKey: "q9",
                        spec: {
                            mode: "project",
                            steps: [{ id: "q9", exerciseKey: "q9" }],
                        },
                    },
                } as any,
            }),
        ).toBe(true);
    });



    it("does not switch to bound exercise for plain quiz cards before a generated practice question binds", () => {
        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: false,
                activeCard: {
                    type: "quiz",
                    id: "quiz",
                    title: "Practice check",
                    passScore: 1,
                    spec: {
                        subject: "linux-terminal-fundamentals",
                        moduleSlug: "linux-module-1-terminal-navigation",
                        topic: "where-am-i",
                        n: 4,
                    },
                } as any,
            }),
        ).toBe(false);
    });

    it("does not switch to bound exercise for plain reading cards", () => {
        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: false,
                activeCard: {
                    type: "text",
                    id: "card-1",
                    title: "Read",
                    markdown: "Hello",
                } as any,
            }),
        ).toBe(false);
    });
});
