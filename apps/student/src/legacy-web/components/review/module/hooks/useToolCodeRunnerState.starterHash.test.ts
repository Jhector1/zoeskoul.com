import { describe, expect, it } from "vitest";

import { resolveStarterHashForToolBind } from "./useToolCodeRunnerState";

describe("resolveStarterHashForToolBind", () => {
    it("preserves the authored starter hash for a terminal snapshot rebind", () => {
        expect(
            resolveStarterHashForToolBind({
                snapshotOverridesSaved: true,
                runtimeStarterHash: "authored-starter-hash",
                progressRuntimeStarterHash: null,
                progressToolStarterHash: null,
                effectiveSavedStarterHash: null,
                currentStarterHash: "mutated-workspace-after-touch",
            }),
        ).toBe("authored-starter-hash");
    });

    it("uses the current authored starter for a normal binding", () => {
        expect(
            resolveStarterHashForToolBind({
                snapshotOverridesSaved: false,
                runtimeStarterHash: "old-runtime-hash",
                progressRuntimeStarterHash: null,
                progressToolStarterHash: null,
                effectiveSavedStarterHash: null,
                currentStarterHash: "current-authored-starter-hash",
            }),
        ).toBe("current-authored-starter-hash");
    });

    it("prefers an explicit saved starter hash", () => {
        expect(
            resolveStarterHashForToolBind({
                snapshotOverridesSaved: true,
                runtimeStarterHash: "runtime-hash",
                progressRuntimeStarterHash: null,
                progressToolStarterHash: null,
                effectiveSavedStarterHash: "saved-original-starter-hash",
                currentStarterHash: "mutated-workspace-hash",
            }),
        ).toBe("saved-original-starter-hash");
    });

    it("falls back to the first known starter hash", () => {
        expect(
            resolveStarterHashForToolBind({
                snapshotOverridesSaved: true,
                runtimeStarterHash: null,
                progressRuntimeStarterHash: null,
                progressToolStarterHash: null,
                effectiveSavedStarterHash: null,
                currentStarterHash: "first-known-starter-hash",
            }),
        ).toBe("first-known-starter-hash");
    });
});
