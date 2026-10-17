import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild React/Vite live preview ownership", () => {
  it("uses one controller for Preview mode and the Code dock", () => {
    const shell = source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(shell).toContain("useReactVitePreview");
    expect(shell).toContain("<PersistentReactPreviewSlot");
    expect(shell).toContain("remoteWebPreview={reactPreviewEnabled ? reactPreview : null}");
    expect(shell).toContain("<WebPreview");
  });

  it("keeps browser code away from runner origin and port", () => {
    const hook = source("./useReactVitePreview.ts");
    expect(hook).toContain("/api/build/projects/");
    expect(hook).not.toContain("RUNNER_BASE_URL");
    expect(hook).not.toContain("5173");
  });

  it("does not bootstrap a dependency lock over unsaved edits", () => {
    const hook = source("./useReactVitePreview.ts");
    const shell = source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(hook).toContain("bootstrapAllowedRef.current");
    expect(hook).toContain("Save your changes before ZoeBuild prepares the React dependency lock.");
    expect(shell).toContain("allowDependencyBootstrap: !codeDirty");
  });

  it("uses the canonical Build source route", () => {
    const client = source("../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx");
    expect(client).toContain("/api/build/projects/");
    expect(client).not.toContain("`/api/projects/");
  });

  it("uses capability content proxy without weakening the iframe sandbox", () => {
    const content = source("../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts");
    const remote = readFileSync(
      fileURLToPath(
        new URL(
          "../../../../../packages/learner-workspace/src/runner/components/RemoteWebPreview.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(content).toContain("proxyFetchTrustedReactPreviewAtRunner");
    expect(content).toContain("validCapability");
    expect(content).not.toContain("loadCurrentBuildAccessSnapshot");
    expect(remote).not.toContain("allow-same-origin");
  });
  it("keeps the last loaded frame while an expired preview restarts", () => {
    const hook = source("./useReactVitePreview.ts");
    expect(hook).toContain("src: current?.src ?? null");
    expect(hook).toContain("revision: current?.revision ?? 0");
    expect(hook).toContain('error.message === "PREVIEW_EXPIRED"');
    expect(hook).toContain("restart();");
  });

  it("bounds preview startup instead of spinning forever", () => {
    const hook = source("./useReactVitePreview.ts");
    expect(hook).toContain("PREVIEW_START_SLOW_NOTICE_MS = 15_000");
    expect(hook).toContain("PREVIEW_START_TIMEOUT_MS = 120_000");
    expect(hook).toContain("new AbortController()");
    expect(hook).toContain("signal: startController.signal");
    expect(hook).toContain(
      "Still starting preview… the first React launch can take up to 2 minutes.",
    );
    expect(hook).toContain(
      "React preview startup timed out after 2 minutes. Retry preview.",
    );
  });

});
