import { describe, expect, it } from "vitest";
import { shouldRetainFreshResetMountedEditor } from "./resetMountedEditorRetentionPolicy";

describe("shouldRetainFreshResetMountedEditor", () => {
    const canonical = {
        resetRevision: 3,
        workspaceGeneration: 3,
        workspaceApplyRevision: 3,
        workspaceOrigin: "starter",
        userEdited: false,
    } as const;

    it("retains the untouched canonical editor during reset navigation", () => {
        expect(shouldRetainFreshResetMountedEditor(canonical)).toBe(true);
    });

    it("does not retain generation-zero state", () => {
        expect(
            shouldRetainFreshResetMountedEditor({
                ...canonical,
                resetRevision: 0,
                workspaceGeneration: 0,
                workspaceApplyRevision: 0,
            }),
        ).toBe(false);
    });

    it("rejects an older runtime generation", () => {
        expect(
            shouldRetainFreshResetMountedEditor({
                ...canonical,
                workspaceGeneration: 2,
            }),
        ).toBe(false);
    });

    it("rejects an editor that has not acknowledged the reset", () => {
        expect(
            shouldRetainFreshResetMountedEditor({
                ...canonical,
                workspaceApplyRevision: 2,
            }),
        ).toBe(false);
    });

    it("ends retention after a legitimate learner edit", () => {
        expect(
            shouldRetainFreshResetMountedEditor({
                ...canonical,
                userEdited: true,
            }),
        ).toBe(false);
    });

    it("rejects non-starter ownership", () => {
        expect(
            shouldRetainFreshResetMountedEditor({
                ...canonical,
                workspaceOrigin: "user",
            }),
        ).toBe(false);
    });

});
