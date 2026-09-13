import { describe, expect, it } from "vitest";
import {
    buildFullIdeSessionRemountKey,
    controlledWorkspaceResetBoundary,
} from "./sessionRemountKey";

describe("controlled FullIDE reset boundary", () => {
    const base = {
        actorKey: "user:1",
        runtimeLanguage: "python",
        initialProjectId: null,
        controlledWorkspace: true,
    };

    it("stays mounted across ordinary exercise navigation in one reset generation", () => {
        const a = buildFullIdeSessionRemountKey({
            ...base,
            scopeKey: "review-tool:a",
            exerciseStateKey: "exercise:a:reset:7",
        });
        const b = buildFullIdeSessionRemountKey({
            ...base,
            scopeKey: "review-tool:b",
            exerciseStateKey: "exercise:b:reset:7",
        });
        expect(a).toBe(b);
    });

    it("remounts when reset generation changes", () => {
        const before = buildFullIdeSessionRemountKey({
            ...base,
            scopeKey: "review-tool:a",
            exerciseStateKey: "exercise:a:reset:7",
        });
        const after = buildFullIdeSessionRemountKey({
            ...base,
            scopeKey: "review-tool:a",
            exerciseStateKey: "exercise:a:reset:8",
        });
        expect(after).not.toBe(before);
        expect(after).toContain("reset:8");
    });

    it("extracts only reset generation", () => {
        expect(controlledWorkspaceResetBoundary("exercise:a:reset:12")).toBe("reset:12");
        expect(controlledWorkspaceResetBoundary("exercise:b:reset:12")).toBe("reset:12");
        expect(controlledWorkspaceResetBoundary("exercise:a")).toBe("reset:none");
    });
});
