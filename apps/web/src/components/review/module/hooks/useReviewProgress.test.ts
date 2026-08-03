import { describe, expect, it, vi } from "vitest";

import { publishReviewNavigationImmediately } from "../navigation/reviewRouteTransition";
import { createReviewNavigationProgressSnapshot } from "./useReviewProgress";

function payload(exerciseIdentity: string, code: string, revision: number) {
    return {
        subjectSlug: "python",
        moduleSlug: "module-1",
        locale: "en",
        state: {
            __saveRevision: revision,
            topics: {
                "topic-1": {
                    runtimeStateV2: {
                        exercises: {
                            [exerciseIdentity]: { code },
                        },
                    },
                },
            },
        },
        activeTopicId: "topic-1",
    } as any;
}

describe("review navigation progress snapshots", () => {
    it("detaches and labels the exercise being left", () => {
        const sourcePayload = payload("exercise:left", "learner work", 12);
        const snapshot = createReviewNavigationProgressSnapshot({
            subjectSlug: "python",
            moduleSlug: "module-1",
            cardIdentity: "project-card",
            exerciseIdentity: "exercise:left",
            progressRevision: 12,
            navigationGeneration: 7,
            payload: sourcePayload,
        });

        sourcePayload.state.topics["topic-1"].runtimeStateV2.exercises["exercise:left"].code =
            "destination mutation";

        expect(snapshot).toMatchObject({
            moduleIdentity: "python:module-1",
            cardIdentity: "project-card",
            exerciseIdentity: "exercise:left",
            progressRevision: 12,
            navigationGeneration: 7,
        });
        expect(
            (snapshot.payload.state as any).topics["topic-1"].runtimeStateV2.exercises[
                "exercise:left"
            ].code,
        ).toBe("learner work");
    });

    it("keeps rapid-navigation snapshots ordered and owner scoped", () => {
        const snapshots = [
            createReviewNavigationProgressSnapshot({
                subjectSlug: "python",
                moduleSlug: "module-1",
                cardIdentity: "project-card",
                exerciseIdentity: "exercise:a",
                progressRevision: 20,
                navigationGeneration: 1,
                payload: payload("exercise:a", "answer a", 20),
            }),
            createReviewNavigationProgressSnapshot({
                subjectSlug: "python",
                moduleSlug: "module-1",
                cardIdentity: "project-card",
                exerciseIdentity: "exercise:b",
                progressRevision: 21,
                navigationGeneration: 2,
                payload: payload("exercise:b", "answer b", 21),
            }),
        ];

        expect(snapshots.map((snapshot) => snapshot.exerciseIdentity)).toEqual([
            "exercise:a",
            "exercise:b",
        ]);
        expect(snapshots.map((snapshot) => snapshot.progressRevision)).toEqual([20, 21]);
    });

    it("does not let a conflict GET/retry block route publication", async () => {
        const put = vi
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }))
            .mockResolvedValueOnce(undefined);
        const get = vi.fn().mockResolvedValue({ __saveRevision: 30 });
        const backgroundTasks: Promise<void>[] = [];
        let published = false;

        publishReviewNavigationImmediately({
            navigationGeneration: 3,
            latestNavigationGeneration: 3,
            snapshot: "exercise:left",
            enqueueSnapshot: () => {
                backgroundTasks.push(
                    put().catch(async (error) => {
                        if (error.status !== 409) throw error;
                        await get();
                        await put();
                    }),
                );
            },
            publish: () => {
                published = true;
            },
        });

        expect(published).toBe(true);
        expect(get).not.toHaveBeenCalled();
        await Promise.all(backgroundTasks);
        expect(get).toHaveBeenCalledOnce();
        expect(put).toHaveBeenCalledTimes(2);
    });

    it("keeps route publication finalized when a background save fails", async () => {
        const backgroundTasks: Promise<void>[] = [];
        let routeTransitioning = true;

        publishReviewNavigationImmediately({
            navigationGeneration: 5,
            latestNavigationGeneration: 5,
            snapshot: "exercise:left",
            enqueueSnapshot: () => {
                backgroundTasks.push(Promise.reject(new Error("offline")).catch(() => undefined));
            },
            publish: () => {
                routeTransitioning = false;
            },
        });

        expect(routeTransitioning).toBe(false);
        await Promise.all(backgroundTasks);
        expect(routeTransitioning).toBe(false);
    });
});
