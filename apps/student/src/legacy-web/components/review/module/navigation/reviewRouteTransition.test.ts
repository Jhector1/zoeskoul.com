import {
    describe,
    expect,
    it,
} from "vitest";

import {
    isLatestReviewNavigationGeneration,
    isReviewRouteTransitionReady,
    publishReviewNavigationImmediately,
    publishReviewToolBindIfCurrent,
    reviewToolBindMatchesCurrentCard,
    resolveReviewDestinationTransitionPresentation,
    resolveReviewTransitionLabel,
    shouldStartReviewRouteTransition,
} from "./reviewRouteTransition";

describe("review navigation publication", () => {
    it("accepts an embedded exercise bind owned by the mounted card when the route has no card target", () => {
        expect(reviewToolBindMatchesCurrentCard({
            bindOwnerCardId: "sketch1",
            routeCardId: null,
            activeCardId: "sketch1",
        })).toBe(true);
    });

    it("rejects a stale bind owned by neither the route nor the mounted card", () => {
        expect(reviewToolBindMatchesCurrentCard({
            bindOwnerCardId: "sketch0",
            routeCardId: "sketch1",
            activeCardId: "sketch1",
        })).toBe(false);
    });

    it("keeps the resolved route authoritative while the mounted card is lagging", () => {
        expect(reviewToolBindMatchesCurrentCard({
            bindOwnerCardId: "sketch0",
            routeCardId: "sketch1",
            activeCardId: "sketch0",
        })).toBe(false);
    });

    it("publishes the destination prompt before a never-resolving progress PUT", () => {
        const neverResolvingSave = new Promise<void>(() => undefined);
        const queued: string[] = [];
        const published: string[] = [];

        const didPublish = publishReviewNavigationImmediately({
            navigationGeneration: 4,
            latestNavigationGeneration: 4,
            snapshot: "exercise:left",
            enqueueSnapshot: (snapshot) => {
                queued.push(snapshot);
                void neverResolvingSave;
            },
            publish: () => published.push("exercise:next"),
        });

        expect(didPublish).toBe(true);
        expect(queued).toEqual(["exercise:left"]);
        expect(published).toEqual(["exercise:next"]);
    });

    it("keeps B published when an A tool bind finishes late", async () => {
        let releaseBind!: () => void;
        const heldBind = new Promise<void>((resolve) => {
            releaseBind = resolve;
        });
        let owner = { navigationGeneration: 0, routeIdentity: "A" };
        let href = "/review/A";

        const staleBind = publishReviewToolBindIfCurrent({
            acceptedOwner: owner,
            getCurrentOwner: () => owner,
            bind: () => heldBind,
            publish: () => {
                owner = { navigationGeneration: 1, routeIdentity: "A/exercise" };
                href = "/review/A/exercise";
            },
        });

        owner = { navigationGeneration: 1, routeIdentity: "B" };
        href = "/review/B";
        expect(href).toBe("/review/B");

        releaseBind();
        await expect(staleBind).resolves.toBe(false);
        expect(owner).toEqual({ navigationGeneration: 1, routeIdentity: "B" });
        expect(href).toBe("/review/B");
    });

    it("keeps C published when stale A and B binds resolve after rapid navigation", async () => {
        const releases: Array<() => void> = [];
        const heldBind = () => new Promise<void>((resolve) => releases.push(resolve));
        let owner = { navigationGeneration: 0, routeIdentity: "A" };
        let href = "/review/A";
        const startBind = (routeIdentity: string) =>
            publishReviewToolBindIfCurrent({
                acceptedOwner: { ...owner, routeIdentity },
                getCurrentOwner: () => owner,
                bind: heldBind,
                publish: () => {
                    href = `/review/${routeIdentity}/exercise`;
                },
            });

        const bindA = startBind("A");
        owner = { navigationGeneration: 1, routeIdentity: "B" };
        href = "/review/B";
        const bindB = startBind("B");
        owner = { navigationGeneration: 2, routeIdentity: "C" };
        href = "/review/C";

        releases.forEach((release) => release());
        await expect(Promise.all([bindA, bindB])).resolves.toEqual([false, false]);
        expect(href).toBe("/review/C");
    });

    it("allows Previous as the latest explicit navigation", () => {
        let href = "/review/B";
        const didPublish = publishReviewNavigationImmediately({
            navigationGeneration: 2,
            latestNavigationGeneration: 2,
            snapshot: "B",
            enqueueSnapshot: () => undefined,
            publish: () => {
                href = "/review/A";
            },
        });

        expect(didPublish).toBe(true);
        expect(href).toBe("/review/A");
    });

    it("does not let a late progress save alter the published destination", async () => {
        let finishSave!: () => void;
        const heldSave = new Promise<void>((resolve) => {
            finishSave = resolve;
        });
        let queuedSave = Promise.resolve();
        let href = "/review/A";

        publishReviewNavigationImmediately({
            navigationGeneration: 1,
            latestNavigationGeneration: 1,
            snapshot: "A-progress",
            enqueueSnapshot: () => {
                queuedSave = heldSave;
            },
            publish: () => {
                href = "/review/B";
            },
        });

        expect(href).toBe("/review/B");
        finishSave();
        await queuedSave;
        expect(href).toBe("/review/B");
    });

    it("rejects an older rapid-navigation generation", () => {
        const published: string[] = [];

        expect(
            publishReviewNavigationImmediately({
                navigationGeneration: 8,
                latestNavigationGeneration: 9,
                snapshot: "exercise:first-left",
                enqueueSnapshot: () => undefined,
                publish: () => published.push("exercise:stale"),
            }),
        ).toBe(false);
        expect(
            publishReviewNavigationImmediately({
                navigationGeneration: 9,
                latestNavigationGeneration: 9,
                snapshot: "exercise:second-left",
                enqueueSnapshot: () => undefined,
                publish: () => published.push("exercise:latest"),
            }),
        ).toBe(true);

        expect(published).toEqual(["exercise:latest"]);
        expect(
            isLatestReviewNavigationGeneration({
                navigationGeneration: 8,
                latestNavigationGeneration: 9,
                transitionNavigationGeneration: 8,
            }),
        ).toBe(false);
    });
});

function readiness(
    overrides: Partial<
        Parameters<
            typeof isReviewRouteTransitionReady
        >[0]
    > = {},
) {
    return {
        pendingHref: "/en/course/next",
        currentHref: "/en/course/next",
        browserHref: "/en/course/next",
        progressHydrated: true,
        hasExpectedExerciseSurface: false,
        pendingExerciseBinding: false,
        toolHydrated: undefined,
        exerciseReady: true,
        editorReady: true,
        ...overrides,
    };
}

describe("review route transition readiness", () => {
    it("waits for React and browser route identity", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({
                    currentHref: "/en/course/current",
                }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({
                    browserHref: "/en/course/current",
                }),
            ),
        ).toBe(false);
    });

    it("waits for authoritative progress hydration", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({
                    progressHydrated: false,
                }),
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
                    exerciseReady: false,
                    editorReady: false,
                }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    pendingExerciseBinding: false,
                    toolHydrated: false,
                    exerciseReady: true,
                    editorReady: true,
                }),
            ),
        ).toBe(false);

        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    pendingExerciseBinding: false,
                    toolHydrated: true,
                    exerciseReady: true,
                    editorReady: true,
                }),
            ),
        ).toBe(true);
    });

    it("keeps both surfaces loading when only the exercise is ready", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    toolHydrated: true,
                    exerciseReady: true,
                    editorReady: false,
                }),
            ),
        ).toBe(false);
    });

    it("keeps both surfaces loading when only the editor is ready", () => {
        expect(
            isReviewRouteTransitionReady(
                readiness({
                    hasExpectedExerciseSurface: true,
                    toolHydrated: true,
                    exerciseReady: false,
                    editorReady: true,
                }),
            ),
        ).toBe(false);
    });

    it("allows a ready non-editor destination", () => {
        expect(
            isReviewRouteTransitionReady(readiness()),
        ).toBe(true);
    });
});

describe("review destination transition presentation", () => {
    it("drives exercise and editor loading from one active identity", () => {
        expect(
            resolveReviewDestinationTransitionPresentation({
                isTransitioning: true,
                destinationIdentity: "/en/course/next",
                destinationPublished: true,
                destinationReady: false,
            }),
        ).toEqual({
            isDestinationTransitioning: true,
            showExerciseSkeleton: true,
            showEditorLoading: true,
            destinationIdentity: "/en/course/next",
            destinationPublished: true,
            destinationReady: false,
        });
    });

    it("clears both localized states in the same final flip", () => {
        expect(
            resolveReviewDestinationTransitionPresentation({
                isTransitioning: false,
                destinationIdentity: "/en/course/next",
                destinationPublished: true,
                destinationReady: true,
            }),
        ).toEqual({
            isDestinationTransitioning: false,
            showExerciseSkeleton: false,
            showEditorLoading: false,
            destinationIdentity: null,
            destinationPublished: false,
            destinationReady: false,
        });
    });
});

describe("review route transition monotonicity", () => {
    it("starts one transition for a new destination", () => {
        expect(
            shouldStartReviewRouteTransition({
                pendingHref: null,
                revealedHref: "/en/course/current",
                nextHref: "/en/course/next",
                browserHref: "/en/course/current",
            }),
        ).toBe(true);
    });

    it("does not restart while the same destination is pending", () => {
        expect(
            shouldStartReviewRouteTransition({
                pendingHref: "/en/course/next",
                revealedHref: null,
                nextHref: "/en/course/next",
                browserHref: "/en/course/current",
            }),
        ).toBe(false);
    });

    it("does not reopen the mask after destination reveal", () => {
        expect(
            shouldStartReviewRouteTransition({
                pendingHref: null,
                revealedHref: "/en/course/next",
                nextHref: "/en/course/next",
                browserHref: "/en/course/next",
            }),
        ).toBe(false);
    });

    it("allows later navigation to another destination", () => {
        expect(
            shouldStartReviewRouteTransition({
                pendingHref: null,
                revealedHref: "/en/course/next",
                nextHref: "/en/course/third",
                browserHref: "/en/course/next",
            }),
        ).toBe(true);
    });
});

describe("review transition presentation label", () => {
    it("keeps one Loading label while save state changes", () => {
        expect(
            resolveReviewTransitionLabel({
                isRouteTransitioning: true,
                isModuleContinuePending: false,
                saveStatus: "saved",
            }),
        ).toBe("Loading...");

        expect(
            resolveReviewTransitionLabel({
                isRouteTransitioning: true,
                isModuleContinuePending: false,
                saveStatus: "saving",
            }),
        ).toBe("Loading...");
    });

    it("keeps Loading during module continuation", () => {
        expect(
            resolveReviewTransitionLabel({
                isRouteTransitioning: false,
                isModuleContinuePending: true,
                saveStatus: "saving",
            }),
        ).toBe("Loading...");
    });

    it("preserves standalone background-saving feedback", () => {
        expect(
            resolveReviewTransitionLabel({
                isRouteTransitioning: false,
                isModuleContinuePending: false,
                saveStatus: "saving",
            }),
        ).toBe("Saving progress...");
    });
});
