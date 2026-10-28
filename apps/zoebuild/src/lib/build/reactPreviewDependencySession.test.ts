import { describe, expect, it } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { previewDependencySnapshotChanged } from "./reactPreviewDependencySession";
import { mayAutoRecoverReactPreviewDependencies } from "./reactPreviewDependencyRecovery";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const f = (path: string, content: string): WorkspaceSyncEntry => ({kind: "file", path, content});
const v1 = [f("package.json", "{\"name\":\"v1\"}"), f("src/App.tsx", "Old")];

describe("K18 dependency-aware preview session transitions", () => {
  it("keeps Vite HMR for ordinary code edits and reorders", () => {
    expect(previewDependencySnapshotChanged(v1, [f("src/App.tsx", "New"), f("package.json", "{\"name\":\"v1\"}")])).toBe(false);
  });
  it("restarts on package changes instead of syncing into the old runner", () => {
    expect(previewDependencySnapshotChanged(v1, [f("package.json", "{\"name\":\"v2\"}"), f("src/App.tsx", "New")])).toBe(true);
  });
  it("restarts on lockfile and approval changes, including presence", () => {
    expect(previewDependencySnapshotChanged(v1, [...v1, f("pnpm-lock.yaml", "lock")])).toBe(true);
    expect(previewDependencySnapshotChanged(v1, [...v1, f("zoebuild-dependency-approval.json", "signed")])).toBe(true);
    expect(previewDependencySnapshotChanged([...v1, f("pnpm-lock.yaml", "old")], [...v1, f("pnpm-lock.yaml", "new")])).toBe(true);
    expect(previewDependencySnapshotChanged(v1, v1)).toBe(false);
  });
  it("routes only recoverable 409s through bootstrap and never auto-approves a bad signature", () => {
    expect(mayAutoRecoverReactPreviewDependencies({status:409,code:"BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",message:"Project dependencies require owner-approved, versioned resolution."})).toBe(true);
    expect(mayAutoRecoverReactPreviewDependencies({status:409,code:"BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",message:"Project dependency signature was not issued by ZoeBuild."})).toBe(false);
  });
  it("the existing hook routes changed snapshots and specific sync failures into its one-shot restart", () => {
    const hook=readFileSync(join(process.cwd(),"src/components/builder/useReactVitePreview.ts"),"utf8");
    expect(hook).toContain("previewDependencySnapshotChanged(session.workspaceEntries, sendingEntries)");
    expect(hook).toContain("response.status === 409 && mayAutoRecoverReactPreviewDependencies({");
    expect(hook).toContain('throw new Error("PREVIEW_RESTART_REQUIRED")');
    expect(hook).toContain('await cancelCurrent();');
    expect(hook).toContain('await start();');
  });
});
