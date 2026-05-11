import { describe, expect, it } from "vitest";
import { planExerciseCounts } from "./planExerciseCounts.js";

describe("planExerciseCounts edge cases", () => {
    it("never produces negative counts", () => {
        const result = planExerciseCounts({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0,
                    multi_choice: 0,
                    drag_reorder: 0,
                    fill_blank_choice: 0,
                    code_input: 1,
                },
            },
            total: 3,
        });

        for (const count of Object.values(result.counts)) {
            expect(count).toBeGreaterThanOrEqual(0);
        }
    });

    it("preserves exact total for small totals", () => {
        for (const total of [1, 2, 3, 4, 5]) {
            const result = planExerciseCounts({
                policy: {
                    source: "module_spec",
                    mix: {
                        single_choice: 0.2,
                        multi_choice: 0.2,
                        drag_reorder: 0.1,
                        fill_blank_choice: 0.3,
                        code_input: 0.2,
                    },
                },
                total,
            });

            expect(Object.values(result.counts).reduce((sum, n) => sum + n, 0)).toBe(total);
        }
    });

    it("makes code_input dominant when code_input has the largest mix and dominance is practical", () => {
        const result = planExerciseCounts({
            policy: {
                source: "module_spec",
                mix: {
                    single_choice: 0.1,
                    multi_choice: 0.1,
                    drag_reorder: 0.05,
                    fill_blank_choice: 0.2,
                    code_input: 0.55,
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

        expect(result.dominantKind).toBe("code_input");
        expect(dominantCount).toBeGreaterThanOrEqual(maxOther);    });
});