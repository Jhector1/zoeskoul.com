import { describe, expect, it } from "vitest";

import { resolveExternalWorkspaceApplyKey, resolveReadyWorkspaceReplacementRevision, shouldHydrateWorkspaceSnapshot } from "./externalWorkspaceControl";

describe("authoritative mounted workspace hydration", () => {
    it("reapplies a previously hydrated starter after learner edits", () => {
        const keys = { currentKey: "starter + ffggggfff", nextKey: "starter", lastHydratedKey: "starter" };
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, authoritative: false })).toBe(false);
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, authoritative: true })).toBe(true);
        expect(shouldHydrateWorkspaceSnapshot({ ...keys, currentKey: "starter", authoritative: true })).toBe(false);
    });

    it("does not acknowledge a new revision using the previous render's snapshot", () => {
        const command = { revision: "reset:1:apply:1", requestedWorkspaceKey: "starter" };
        expect(resolveReadyWorkspaceReplacementRevision({ ...command, committedWorkspaceKey: "starter + ffggggfff" })).toBeUndefined();
        expect(resolveReadyWorkspaceReplacementRevision({ ...command, committedWorkspaceKey: "starter" })).toBe(command.revision);
    });
});

describe("resolveExternalWorkspaceApplyKey", () => {
    it("tracks workspace content during normal controlled hydration", () => {
        expect(
            resolveExternalWorkspaceApplyKey({
                externalWorkspaceKey: "workspace-a",
                initialWorkspaceKey: "starter",
            }),
        ).toBe("workspace-a::initial:starter");

        expect(
            resolveExternalWorkspaceApplyKey({
                externalWorkspaceKey: "workspace-b",
                initialWorkspaceKey: "starter",
            }),
        ).toBe("workspace-b::initial:starter");
    });

    it("uses the explicit revision for mounted-editor replacement commands", () => {
        const first = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-a",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:1",
        });
        const sameCommandWithDifferentParentSnapshot = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-b",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:1",
        });
        const nextCommand = resolveExternalWorkspaceApplyKey({
            externalWorkspaceKey: "solution-b",
            initialWorkspaceKey: "starter",
            revision: "exercise-1:2",
        });

        expect(sameCommandWithDifferentParentSnapshot).toBe(first);
        expect(nextCommand).not.toBe(first);
    });
});
