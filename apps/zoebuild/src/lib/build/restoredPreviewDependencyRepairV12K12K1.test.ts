import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const hook=read("../../components/builder/useReactVitePreview.ts");
const route=read("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");
const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const css=read("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.module.css");
describe("V12K12K1 restored preview and compact scrollable history",()=>{
  it("distinguishes already-saved restored snapshots from unsaved editor edits",()=>{
    expect(hook).toContain("restoredDependencyPinnedRef.current");
    expect(hook).toContain("This restored version is already saved.");
    expect(hook).toContain("Save your changes before ZoeBuild prepares the React dependency lock.");
    expect(shell).toContain("restoredDependencyPinned: restoredVersionPinned === previewSourceVersion");
  });
  it("requires explicit approval for arbitrary repair but supports owner-selected exact-history automatic recovery",()=>{
    expect(route).toContain("options.approveRestoredDependencyRepair === true");
    expect(route).toContain("meta.restoredSnapshotVersion === owned?.codeProject.currentVersion");
    expect(route).toContain("!approveRestoredDependencyRepair");
    expect(route).toContain("autoRestoreDependencies");
    expect(route).toContain("adoptRestoredReactDependencyLock");
    expect(route).toContain("options.baseVersion !== owned?.codeProject.currentVersion");
    expect(route).toContain("if (approveRestoredDependencyRepair && !reconcileExisting)");
    expect(route).toContain("bootstrapOwnedBuildProjectDependencyLock({");
  });
  it("automatically restores dependency locks and keeps saved files available if preview fails",()=>{
    expect(hook).toContain("autoRestoreDependencies: restoredDependencyPinnedRef.current");
    expect(route).toContain("adoptRestoredReactDependencyLock(prisma");
    expect(shell).toContain('data-testid="zoebuild-dependency-recovery-help"');
    expect(shell).toContain('setMode("code")');
    expect(shell).not.toContain("Approve and prepare dependencies");
    expect(shell).toContain("allowDependencyBootstrap: !codeDirty,");
  });
  it("gives history one internal vertical scroller and compact buttons",()=>{
    expect(css).toContain("max-height:min(55vh,440px)");
    expect(css).toContain("overflow-y:auto");
    expect(css).toContain("scrollbar-width:thin");
    expect(css).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
  });
});
