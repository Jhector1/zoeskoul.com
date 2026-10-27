import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const contextRoute = fileURLToPath(new URL("../../app/api/build/projects/[buildProjectId]/assistant/context/route.ts", import.meta.url));
const shell = fileURLToPath(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url));
const source = (path: string) => readFileSync(path, "utf8");
describe("E15A authorized contextual assistant foundation", () => {
  it("uses canonical owner-scoped project access with no writes", () => {
    const route = source(contextRoute);
    expect(route).toContain("loadCurrentBuildAccessSnapshot(req, {requireAuthority:true})");
    expect(route).toContain("getBuildProjectCommand");
    expect(route).toContain("createPrismaBuildProjectReader");
    expect(route).toContain('"no-store"');
    expect(route).not.toContain("updateMany(");
    expect(route).not.toContain("createMany(");
  });
  it("gets server-verified context and routes ordinary changes to guarded targeted editing", () => {
    const client = source(shell);
    expect(client).toContain("/assistant/context");
    expect(client).toContain("resolveZoeSelectedProvider");
    expect(client).not.toContain("isExplicitFullRebuildIntent");
    expect(client).toContain("/assistant/edit");
    expect(client).toContain("pendingFileEdit");
    expect(client).toContain("Apply reviewed file edits");
    expect(client).not.toContain("Incremental source editing is not connected yet");
    expect(client).toContain("codeDirty");
  });
});
