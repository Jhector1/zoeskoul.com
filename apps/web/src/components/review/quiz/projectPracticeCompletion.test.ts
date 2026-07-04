import { describe, expect, it, vi } from "vitest";

import {
    flushBeforeExerciseRouteNavigation,
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
        });
    });

    it("prefers a saved item result over stale saved metadata", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: null,
                saved: { attempts: 2, ok: false },
                savedItemResultOk: true,
            }),
        ).toEqual({
            checked: true,
            ok: true,
        });
    });

    it("prefers mounted live state over older saved state", () => {
        expect(
            resolveReviewPracticeCompletionStatus({
                live: {
                    attempts: 3,
                    ok: true,
                    itemResultOk: true,
                },
                saved: { attempts: 1, ok: false },
            }),
        ).toEqual({
            checked: true,
            ok: true,
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
