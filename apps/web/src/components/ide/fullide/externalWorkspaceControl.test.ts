import { describe, expect, it } from "vitest";

import { resolveExternalWorkspaceApplyKey } from "./externalWorkspaceControl";

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
