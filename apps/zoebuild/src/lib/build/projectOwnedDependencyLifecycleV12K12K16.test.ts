import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path,import.meta.url),"utf8");
const api = read("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");
const preview = read("../../components/builder/useReactVitePreview.ts");


describe("K16 project-owned dependencies lifecycle",()=>{
  it("automatically requests project-owned preparation without overriding historical restore policy",()=>{
    expect(preview).toContain("autoPrepareProjectDependencies: !restoredDependencyPinnedRef.current");
    expect(preview).toContain("autoRestoreDependencies: restoredDependencyPinnedRef.current");
  });
  it("requires ownership, CAS, registry pins and scriptless runner",()=>{
    expect(api).toContain("getBuildProjectCommand({");
    expect(api).toContain("saved.sourceVersion !== baseVersion");
    expect(api).toContain("inspectProjectOwnedDependencyPreparation({");
    expect(api).toContain("createPrismaBuildProjectSourceWriter(prisma, {createRevision:false})");
    expect(api).toContain("execute: executeTrustedDependencyLockBootstrapAtRunner");
    expect(api).toContain("ProjectDependencyApprovalError");
  });
  it("never accepts client chosen packages or owner-approval replacement in auto mode",()=>{
    expect(api).toContain("options.desiredDependencies !== undefined");
    expect(api).toContain("approveRestoredDependencyRepair || options.desiredDependencies !== undefined");
    expect(api).toContain('decision === "already-approved"');
  });
});
