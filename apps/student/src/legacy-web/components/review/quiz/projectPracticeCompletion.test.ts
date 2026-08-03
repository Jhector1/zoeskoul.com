import { describe, expect, it, vi } from "vitest";

import {
    buildReviewFinalizedActionConsumedPatch,
    findReviewPracticeCompletionForExercise,
    flushBeforeExerciseRouteNavigation,
    isReviewFinalizedActionConsumed,
    isReviewPracticeStepComplete,
    resolveReviewPracticeCompletionStatus,
} from "./projectPracticeCompletion";

describe("resolveReviewPracticeCompletionStatus", () => {
    it("uses saved project-step metadata when the step is not mounted", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: null,
                saved: { attempts: 2, ok: true },
            }),
        ).toEqual({
            checked: true,
            ok: true,
            finalized: true,
        });
    });

    it("prefers a saved item result over stale saved metadata", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: null,
                saved: { attempts: 2, ok: false },
                savedItem: { ok: true },
            }),
        ).toEqual({
            checked: true,
            ok: true,
            finalized: true,
        });
    });

    it("does not let an empty live loading shell shadow saved project completion", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: {
                    attempts: 0,
                    ok: null,
                    finalized: false,
                },
                liveItem: null,
                saved: {
                    attempts: 2,
                    ok: true,
                    finalized: true,
                },
                savedItem: { ok: true, finalized: true },
            }),
        ).toEqual({
            checked: true,
            ok: true,
            finalized: true,
        });
    });

    it("prefers mounted live state over older saved state", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: {
                    attempts: 3,
                    ok: true,
                },
                liveItem: { ok: true },
                saved: { attempts: 1, ok: false, finalized: false },
                savedItem: { ok: false, finalized: false },
            }),
        ).toEqual({
            checked: true,
            ok: true,
            finalized: true,
        });
    });

    it("unlocks navigation for a finalized incorrect reveal without granting credit", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: { attempts: 0, ok: false },
                liveItem: {
                    ok: false,
                    finalized: true,
                    revealed: true,
                    revealUsed: true,
                    hasRevealAnswer: true,
                },
            }),
        ).toEqual({
            checked: true,
            ok: false,
            finalized: true,
        });
    });

    it("restores reveal finalization from a saved item patch", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: null,
                saved: { attempts: 0, ok: false },
                savedItem: {
                    ok: false,
                    revealed: true,
                    hasRevealAnswer: true,
                },
            }),
        ).toEqual({
            checked: true,
            ok: false,
            finalized: true,
        });
    });

    it("keeps an ordinary unlimited wrong attempt open", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: { attempts: 1, ok: false },
                liveItem: { ok: false, finalized: false },
            }),
        ).toEqual({
            checked: true,
            ok: false,
            finalized: false,
        });
    });
});

describe("flushBeforeExerciseRouteNavigation", () => {
    it("flushes state before navigation", async () => {
        const order: string[] = [];

        await flushBeforeExerciseRouteNavigation({
            flush: () => order.push("flush"),
            navigate: async () => {
                order.push("navigate");
            },
        });

        expect(order).toEqual(["flush", "navigate"]);
    });

    it("calls navigation once", async () => {
        const navigate = vi.fn();

        await flushBeforeExerciseRouteNavigation({
            flush: vi.fn(),
            navigate,
        });

        expect(navigate).toHaveBeenCalledTimes(1);
    });
});


describe("project practice completion lookup", () => {
    it("finds a finalized reveal saved under the scoped practice key", () => {
        const scopedKey =
            "python:applied-python-projects:oop:methods-and-responsibility:add-drive-method";

        const completion = findReviewPracticeCompletionForExercise({
            exerciseId: "add-drive-method",
            practiceMeta: {
                [scopedKey]: {
                    attempts: 0,
                    ok: false,
                    finalized: true,
                },
            },
            practiceItemPatch: {
                [scopedKey]: {
                    revealed: true,
                    result: {
                        ok: false,
                        finalized: true,
                        revealUsed: true,
                    },
                },
            },
        });

        expect(completion.key).toBe(scopedKey);
        expect(
            isReviewPracticeStepComplete({
                meta: completion.meta,
                item: completion.item,
            }),
        ).toBe(true);
    });

    it("restores project-step completion from an item-only reveal patch", () => {
        const scopedKey = "python:module:section:topic:add-drive-method";
        const completion = findReviewPracticeCompletionForExercise({
            exerciseId: "add-drive-method",
            practiceItemPatch: {
                [scopedKey]: {
                    revealed: true,
                    result: {
                        ok: false,
                        finalized: true,
                        revealUsed: true,
                        revealAnswer: { kind: "code" },
                    },
                },
            },
        });

        expect(
            isReviewPracticeStepComplete({
                meta: completion.meta,
                item: completion.item,
            }),
        ).toBe(true);
    });

    it("does not complete an ordinary wrong project attempt", () => {
        const completion = findReviewPracticeCompletionForExercise({
            exerciseId: "add-drive-method",
            practiceMeta: {
                "python:module:section:topic:add-drive-method": {
                    attempts: 1,
                    ok: false,
                    finalized: false,
                },
            },
        });

        expect(
            isReviewPracticeStepComplete({
                meta: completion.meta,
                item: completion.item,
            }),
        ).toBe(false);
    });

    it("builds and reads the durable finalized-action marker", () => {
        const patch = buildReviewFinalizedActionConsumedPatch();

        expect(patch).toEqual({ finalizedActionConsumed: true });
        expect(isReviewFinalizedActionConsumed(patch)).toBe(true);
        expect(
            isReviewFinalizedActionConsumed(
                buildReviewFinalizedActionConsumedPatch(false),
            ),
        ).toBe(false);
    });
});
