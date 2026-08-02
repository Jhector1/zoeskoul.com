import { describe, expect, it } from "vitest";

import { isReviewRouteTransitionReady } from "./reviewRouteTransition";

function readiness(
    overrides: Partial<
        Parameters<typeof isReviewRouteTransitionReady>[0]
    > = {},
) {
    return {
        pendingHref: "/en/course/next",
        currentHref: "/en/course/next",
        browserHref: "/en/course/next",
        progressHydrated: true,
        showSkeleton: false,
        saveStatus: "saved",
        hasExpectedExerciseSurface: false,
        pendingExerciseBinding: false,
        toolHydrated: undefined,
        ...overrides,
    };
}

describe("review route transition readiness", () => {
    it("waits for React and browser route identity", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({ currentHref: "/en/course/current" }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({ browserHref: "/en/course/current" }),
            ),
        ).toBe(false);
    });

    it("waits for progress, skeleton completion, and queued saves", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({ progressHydrated: false }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({ showSkeleton: true }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({ saveStatus: "saving" }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({ saveStatus: "unsaved" }),
            ),
        ).toBe(false);
    });

    it("waits for expected editor binding and hydration", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    pendingExerciseBinding: true,
                    toolHydrated: false,
                }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    pendingExerciseBinding: false,
                    toolHydrated: false,
                }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    pendingExerciseBinding: false,
                    toolHydrated: true,
                }),
            ),
        ).toBe(true);
    });

    it("allows a ready non-editor destination", () => {
        expect(
            isReviewRouteTransitionReady(readiness()),
        ).toBe(true);
    });

    it("does not deadlock settled error or conflict states", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({ saveStatus: "error" }),
            ),
        ).toBe(true);

        expect(
            isReviewRouteTransitionReady(
                readiness({ saveStatus: "conflict" }),
            ),
        ).toBe(true);
    });
});
