import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { needsDependencyRecoveryAssistance } from "./historyDependencyReview";
import { mayAutoRecoverReactPreviewDependencies } from "./reactPreviewDependencyRecovery";
const read = (path:string) => readFileSync(new URL(path,import.meta.url),"utf8");

describe("V12K12K8 automatic historical preview",()=>{
  it("attempts safe recovery for the precise legacy approvals but never bypasses invalid signatures",()=>{
    expect(mayAutoRecoverReactPreviewDependencies({status:409,code:"BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",message:"Project dependencies require owner-approved, versioned resolution."})).toBe(true);
    expect(mayAutoRecoverReactPreviewDependencies({status:409,code:"BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED",message:"Project dependency signature was not issued by ZoeBuild."})).toBe(false);
  });
  it("never relabels network failures, rate limits, or compilers as dependency approval",()=>{
    for (const message of ["Runner unavailable","React build failed","Service busy","Source changed"])
      expect(needsDependencyRecoveryAssistance("error",message)).toBe(false);
    expect(needsDependencyRecoveryAssistance("starting","Project dependencies require owner-approved, versioned resolution.")).toBe(false);
  });
  it("restored source is automatically recovered without an extra saved history entry",()=>{
    const hook=read("../../components/builder/useReactVitePreview.ts");
    const route=read("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");
    expect(hook).toContain("autoRestoreDependencies: restoredDependencyPinnedRef.current");
    // K20C reports concrete preparation phases instead of the old generic label.
    // The capability to auto-recover and to reconcile a new saved source is the contract.
    expect(hook).toContain('message: "Verifying the saved version dependency lock…"');
    expect(hook).toContain('message:"Verifying the website document…"');
    expect(hook).toContain('const preparedVersion = bootstrapData.bootstrap?.source?.sourceVersion');
    expect(hook).toContain('await reconcileConflict(startingVersion)');
    expect(hook).toContain("window.location.reload()");
    expect(route).toContain("adoptRestoredReactDependencyLock(prisma");
    expect(route).toContain("createPrismaBuildProjectSourceWriter(prisma, {createRevision:false})");
    expect(route).toContain("expectedSourceVersion: baseVersion");
  });
  it("keeps security gates while hiding technical approval controls",()=>{
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    const hook=read("../../components/builder/useReactVitePreview.ts");
    expect(shell).not.toContain("Approve and prepare dependencies");
    expect(shell).not.toContain("Review saved package.json");
    expect(shell).toContain('data-testid="zoebuild-dependency-recovery-help"');
    expect(shell).toContain("Its files are unchanged.");
    expect(hook).toContain("if (!bootstrapAllowedRef.current)");
    expect(hook).toContain("baseVersion: startingVersion");
    expect(hook).toContain("workspaceRevisionRef.current !== startingWorkspaceRevision");
  });
});
