import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mayAutoRecoverReactPreviewDependencies } from "./reactPreviewDependencyRecovery";

describe("P3B7E5A automatic TanStack dependency recovery", () => {
  it("wires source-version-locked owner resolution into the preview without silently upgrading packages", () => {
    const hook = readFileSync(
      new URL("../../components/builder/useReactVitePreview.ts", import.meta.url),
      "utf8",
    );
    expect(hook).toContain("mayAutoRecoverReactPreviewDependencies({");
    const shared = readFileSync(
      new URL("./sharedPreviewDependencyPreparation.ts", import.meta.url), "utf8",
    );
    const sharedHook = readFileSync(
      new URL("../../components/builder/useSharedPreviewDependencyPreparation.ts", import.meta.url), "utf8",
    );
    expect(hook).toContain("useSharedPreviewDependencyPreparation(input)");
    expect(hook).toContain("requestSavedPreviewDependencyPreparation({");
    expect(sharedHook).toContain("prepareSharedPreviewDependencies({...selection,isCurrent,");
    expect(shared).toContain("reconcileExisting:true,baseVersion:input.sourceVersion");
    expect(shared).toContain('credentials: "same-origin"');
    expect(shared).toContain("autoRestoreDependencies:input.restoredDependencyPinned");
    expect(shared).toContain("autoPrepareProjectDependencies:!input.restoredDependencyPinned");
    expect(hook).toContain("if (!bootstrapAllowedRef.current)");
    expect(hook).toContain("workspaceRevisionRef.current !== startingWorkspaceRevision");
    // K20D2A deliberately continues a verified dependency bootstrap in-page.
    // Do not regress to a full reload that discards the selected history UI.
    expect(hook).not.toContain("window.location.reload()");
    expect(hook).toContain("await reconcilePreparedDependencies(startingVersion)");
    expect(hook).toContain("setPreparedReplaySerial(serial => serial + 1)");
    expect(hook).not.toContain('data.code.startsWith("BUILD_DEPENDENCY_LOCK")');
    expect(hook).not.toContain("desiredDependencies:");
  });

  it("automatically prepares an unsealed older project's pinned manifest", () => {
    expect(mayAutoRecoverReactPreviewDependencies({
      status: 409,
      code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",
      message: "Project dependencies require owner-approved, versioned resolution.",
    })).toBe(true);
  });

  it("automatically creates the first trusted TanStack lock", () => {
    expect(mayAutoRecoverReactPreviewDependencies({
      status: 409,
      code: "BUILD_DEPENDENCY_LOCK_INVALID",
      message: "TanStack preview requires one-time trusted dependency preparation.",
    })).toBe(true);
  });

  it.each([
    { status: 403, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "Project dependencies require owner-approved, versioned resolution." },
    { status: 429, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "Project dependencies require owner-approved, versioned resolution." },
    { status: 409, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "Project dependencies or lockfile changed after approval." },
    { status: 409, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "Project dependency signature was not issued by ZoeBuild." },
    { status: 409, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "dependencies only permits registry packages with exact pinned versions." },
    { status: 409, code: "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED", message: "Workspace cannot override trusted dependency installation settings." },
    { status: 409, code: "BUILD_DEPENDENCY_LOCK_INVALID", message: "ZoeBuild dependency lock pnpm-lock.yaml is empty." },
    { status: 409, code: "BUILD_DEPENDENCY_LOCK_INVALID", message: "React preview requires one-time trusted dependency preparation." },
    { status: 409, code: "BUILD_PREPARATION_INVALID", message: "Invalid source." },
    { status: 409, code: "BUILD_PREVIEW_SOURCE_CONFLICT", message: "Reload source." },
    { status: 502, code: "BUILD_PREVIEW_RUNNER_UNAVAILABLE", message: "Runner unavailable." },
  ])("does not auto-approve invalid, tampered or unrelated responses: $message", input => {
    expect(mayAutoRecoverReactPreviewDependencies(input)).toBe(false);
  });
});
