import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relative: string) {
  return readFileSync(path.resolve(process.cwd(), "src", relative), "utf8");
}

describe("TanStack immutable preview source handoff", () => {
  it("converts only the trusted Runner restart signal into a retryable browser code", () => {
    const route = source("app/api/build/projects/[buildProjectId]/preview/[previewId]/sync/route.ts");
    expect(route).toContain("TANSTACK_PREVIEW_RESTART_REQUIRED");
    expect(route).toContain('error.status === 409 && error.message === TANSTACK_PREVIEW_RESTART_REQUIRED');
    expect(route).toContain('code: "BUILD_PREVIEW_RESTART_REQUIRED"');
    expect(route).toContain("requireRunnerActorKey(userId)");
    expect(route).toContain("createOwnedReactPreviewBuildRequest");
  });
  it("uses the authenticated cancel-and-start lifecycle after source changes", () => {
    const hook = source("components/builder/useReactVitePreview.ts");
    expect(hook).toContain('decideTanstackPreviewSync');
    expect(hook).toContain('throw new Error("PREVIEW_RESTART_REQUIRED")');
    expect(hook).toContain('sessionSourceVersion: session.sourceVersion');
    expect(hook).toContain("sourceVersion: startingVersion");
    expect(hook).toContain("await cancelCurrent()");
    expect(hook).toContain("await start()");
  });
});
