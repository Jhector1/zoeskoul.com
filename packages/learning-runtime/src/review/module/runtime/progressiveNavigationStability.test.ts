import { describe, expect, it } from "vitest";

import {
    computeProgressiveUnlock,
    isTrustedProgressiveRouteLease,
    resolveFurthestUnlockedTargetKey,
} from "./progressiveUnlock";

describe("progressive navigation stability", () => {
    it("keeps an accepted route lease while the learner remains on that route", () => {
        expect(
            isTrustedProgressiveRouteLease({
                trustedTargetKey: "exercise:project:mp-2",
                currentTargetKey: "exercise:project:mp-2",
            }),
        ).toBe(true);

        // Route ownership, not a single optimistic progress render, owns the lease.
        expect(
            isTrustedProgressiveRouteLease({
                trustedTargetKey: "exercise:project:mp-2",
                currentTargetKey: "exercise:project:mp-2",
            }),
        ).toBe(true);
    });

    it("ends the route lease when another target becomes authoritative", () => {
        expect(
            isTrustedProgressiveRouteLease({
                trustedTargetKey: "exercise:project:mp-2",
                currentTargetKey: "card:next-topic",
            }),
        ).toBe(false);

        expect(
            isTrustedProgressiveRouteLease({
                trustedTargetKey: "exercise:project:mp-2",
                currentTargetKey: null,
            }),
        ).toBe(false);
    });

    it("chooses the furthest unlocked progression frontier, not the first lesson", () => {
        expect(
            resolveFurthestUnlockedTargetKey({
                orderedKeys: [
                    "card:intro",
                    "exercise:lesson-1",
                    "card:project",
                    "exercise:project:mp-1",
                    "exercise:project:mp-2",
                    "card:locked-later",
                ],
                unlockedTargetKeys: new Set([
                    "card:intro",
                    "exercise:lesson-1",
                    "card:project",
                    "exercise:project:mp-1",
                    "exercise:project:mp-2",
                ]),
            }),
        ).toBe("exercise:project:mp-2");
    });

    it("reports the final ordered target as the frontier when gating is disabled before hydration", () => {
        const result = computeProgressiveUnlock({
            registry: {
                orderedKeys: ["card:first", "exercise:middle", "card:last"],
                byKey: {},
                byRoute: {},
            } as any,
            progress: null,
            progressHydrated: false,
        });

        expect(result.earliestUnlockedTargetKey).toBe("card:first");
        expect(result.furthestUnlockedTargetKey).toBe("card:last");
    });

    it("reports no frontier when no registry exists", () => {
        const result = computeProgressiveUnlock({
            registry: null,
            progress: null,
            progressHydrated: true,
        });

        expect(result.furthestUnlockedTargetKey).toBeNull();
    });
});
