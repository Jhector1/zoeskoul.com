
import { describe, expect, it } from "vitest";
import { planExerciseCounts } from "./planExerciseCounts.js";

describe("planExerciseCounts", () => {
    it("sums exactly to the requested total", () => {
        const result = planExerciseCounts({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.2,
                    multi_choice: 0.2,
                    drag_reorder: 0.1,
                    fill_blank_choice: 0.2,
                    code_input: 0.3,
                },
            },
            total: 5,
        });

        expect(
            Object.values(result.counts).reduce((sum, n) => sum + n, 0),
        ).toBe(5);
        expect(result.total).toBe(5);
    });

    it("ensures code_input appears when code_input weight is at least 35%", () => {
        const result = planExerciseCounts({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.22,
                    multi_choice: 0.22,
                    drag_reorder: 0.11,
                    fill_blank_choice: 0.1,
                    code_input: 0.35,
                },
            },
            total: 4,
        });

        expect(result.counts.code_input).toBeGreaterThanOrEqual(1);
    });

    it("makes the chosen dominant kind actually dominant when practical", () => {
        const result = planExerciseCounts({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.2,
                    multi_choice: 0.2,
                    drag_reorder: 0.15,
                    fill_blank_choice: 0.25,
                    code_input: 0.2,
                },
            },
            total: 5,
        });

        const dominantCount = result.counts[result.dominantKind];
        const maxOther = Math.max(
            ...Object.entries(result.counts)
                .filter(([kind]) => kind !== result.dominantKind)
                .map(([, count]) => count),
        );

        expect(dominantCount).toBeGreaterThanOrEqual(maxOther);    });
});