import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
const shell = source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const code = source("../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx");

describe("ZoeBuild single TanStack preview renderer", () => {
  it("never falls back to static HTML for missing or unsupported sessions", () => {
    expect(shell).toContain('props.project.stackId === "tanstack-start-v1"');
    expect(shell).toContain('state: "starting"');
    expect(shell).toContain('state: "error"');
    expect(shell).toContain('src: null');
    expect(shell).toContain("preview={fullStackPreview}");
    expect(shell).not.toContain("<WebPreview");
    expect(shell).not.toContain("requestStaticPreviewCommerce");
    expect(shell).not.toContain("window.location.assign(");
  });

  it("shares the isolated descriptor with Code and never supplies static commerce callbacks", () => {
    expect(shell).toContain("remoteWebPreview={fullStackPreview}");
    expect(shell).not.toContain("webPreviewCommerceRequest");
    expect(code).toContain("remoteWebPreview: RemoteWebPreviewDescriptor");
    expect(code).toContain("remoteWebPreviewSurface={");
    expect(code).toContain("preview={remoteWebPreview}");
    expect(code).not.toContain("webPreviewCommerceRequest");
  });

  it("preserves source-version fencing and the sandboxed runner surface", () => {
    expect(shell).toContain("confirmedSourceVersion !== previewSourceVersion");
    expect(shell).toContain("allowDependencyBootstrap: !codeDirty");
    expect(shell).toContain(`active={!settingsOpen && mode === "preview" && !dependencyRecoveryNeedsAttention}`);
    const remote = source("../../../../../packages/learner-workspace/src/runner/components/RemoteWebPreview.tsx");
    expect(remote).not.toContain("allow-same-origin");
  });
});
