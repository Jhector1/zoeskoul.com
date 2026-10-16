import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild React preview dependency preparation", () => {
  it("classifies a registered clean React source as lock-bootstrap-required before production build creation", () => {
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

  it("reuses the existing clean-only bootstrap branch instead of weakening the production gate", () => {
    const hook = source("./useReactVitePreview.ts");
    const shell = source(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
    );

    expect(hook).toContain(
      'data.code.startsWith("BUILD_DEPENDENCY_LOCK")',
    );
    expect(hook).toContain("/dependency-lock/bootstrap");
    expect(hook).toContain("bootstrapAllowedRef.current");
    expect(hook).toContain("window.location.reload()");
    expect(shell).toContain("allowDependencyBootstrap: !codeDirty");
  });
});
