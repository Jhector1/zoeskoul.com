import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const build = join(process.cwd(), "src/services/build");
const routes = join(process.cwd(), "src/routes");

describe("TanStack-only preview runtime retirement", () => {
  it("has no legacy preview engine, mutation transport or compatibility bridges", () => {
    for (const filename of [
      "reactPreviewRuntime.ts", "reactPreviewPersistentHttp.ts", "reactPreviewMutationCoordinator.ts",
      "reactPreviewReadiness.ts", "reactVitePrebuiltDependencies.ts",
      "reactPreviewResourceAdmission.ts", "reactPreviewProjectDrainPolicy.ts", "reactPreviewOperations.ts",
    ]) expect(readdirSync(build)).not.toContain(filename);
  });
  it("has no production route references to the retired React/Vite engine", () => {
    for (const directory of [routes, build]) {
      for (const file of readdirSync(directory).filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
        const source = readFileSync(join(directory, file), "utf8");
        if (file === "trustedBuildOperations.ts") continue; // legacy static builder remains fail-closed until Worker cutover
        expect(source, file).not.toMatch(/from\s*["'][^"']*reactPreview(Runtime|PersistentHttp|Readiness|MutationCoordinator|ResourceAdmission|ProjectDrainPolicy|Operations)\.js["']/);
      }
    }
    expect(readdirSync(routes)).not.toContain("build.previews.start.ts");
    const route = readFileSync(join(routes, "build.previews.operations.ts"), "utf8");
    expect(route).toContain("startAdmittedTanstackPreview");
    expect(route).not.toContain("startReactPreview(");
  });
  it("keeps the canonical capacity, deletion lock and operation journal", () => {
    for (const filename of [
      "previewAdmissionPolicy.ts", "previewProjectDrainPolicy.ts", "previewOperationJournal.ts",
      "tanstackPreviewCapacity.ts", "tanstackPreviewProjectDrain.ts", "tanstackPreviewSharedLifecycle.ts",
    ]) expect(readdirSync(build)).toContain(filename);
  });
});
