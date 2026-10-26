import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const shell = fs.readFileSync(fileURLToPath(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url)), "utf8");
const route = fs.readFileSync(fileURLToPath(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", import.meta.url)), "utf8");
describe("E15B targeted editing ownership", () => {
  it("requires review for targeted edits and keeps full rebuild separate", () => {
    expect(shell).toContain("pendingFileEdit");
    expect(shell).toContain("Apply reviewed file edits");
    expect(shell).toContain('semantic.action === "edit"');
    expect(shell).toContain('semantic.action === "provider_settings"');
    expect(shell).toContain("/assistant/intent");
    expect(shell).toContain("codeDirty");
  });
  it("authorizes project, enforces AI edit entitlement, and uses canonical versioned save", () => {
    expect(route).toContain("getBuildProjectCommand");
    expect(route).toContain("resolveBuildAccess(access).canEditWithAi");
    expect(route).toContain("enforceSameOriginPost");
    expect(route).toContain("saveBuildProjectSourceCommand");
    expect(route).toContain("project.sourceVersion !== body.baseVersion");
  });
  it("does not use whole-site regeneration or provider mutation APIs", () => {
    expect(route).not.toContain("applyBuildProjectPlanCommand");
    expect(route).not.toContain("commerceProviderRoute");
    expect(route).not.toContain("prisma.commerce");
  });
});
