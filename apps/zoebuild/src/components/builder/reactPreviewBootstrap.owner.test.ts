import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild TanStack preview dependency preparation", () => {
  it("classifies a registered clean TanStack source as lock-bootstrap-required before Worker build creation", () => {
    const server = source("../../lib/build/reactPreviewServer.ts");

    const classify = server.indexOf("prepareRegisteredBuildArtifactPlan({");
    const bootstrap = server.indexOf(
      'previewPlan.dependencyLock.state === "bootstrap-required"',
    );
    const production = server.indexOf("createRegisteredProductionBuildJob({");

    expect(classify).toBeGreaterThan(-1);
    expect(bootstrap).toBeGreaterThan(classify);
    expect(production).toBeGreaterThan(bootstrap);
    expect(server).toContain('"BUILD_DEPENDENCY_LOCK_INVALID"');
  });

  it("uses bounded CAS-scoped dependency bootstrap without weakening the Worker build gate", () => {
    const hook = source("./useReactVitePreview.ts");
    const shell = source(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
    );

    expect(hook).toContain("mayAutoRecoverReactPreviewDependencies({");
    expect(hook).toContain("/dependency-lock/bootstrap");
    expect(hook).toContain("bootstrapAllowedRef.current");
    expect(hook).not.toContain("window.location.reload()");
    expect(hook).toContain("await reconcilePreparedDependencies(startingVersion)");
    expect(shell).toContain("allowDependencyBootstrap: !codeDirty");
  });
});
