import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {needsDependencyRecoveryAssistance} from "./historyDependencyReview";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("V12K12K7 version selection, dependency review, and delete policy",()=>{
 it("distinguishes permission from transport and build errors",()=>{
  expect(needsDependencyRecoveryAssistance("error","Project dependencies require owner-approved, versioned resolution.")).toBe(true);
  expect(needsDependencyRecoveryAssistance("error","The restored files are saved; their dependency lock needs explicit preparation before preview.")).toBe(true);
  expect(needsDependencyRecoveryAssistance("error","Runner unavailable")).toBe(false);
  expect(needsDependencyRecoveryAssistance("starting","Project dependencies require owner-approved, versioned resolution.")).toBe(false);
 });
 it("switches existing saved versions rather than adding history",()=>{
  const view=read("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
  expect(view).toContain("Switch to version");
  expect(view).toContain("deleteVersion(version:number)");
  // K19 moved the typed deletion confirmation into a React dialog. Assert both
  // the visible prompt and the exact-match gate, not the retired prompt string.
  expect(view).toContain('Type <strong>DELETE V{pendingAction.version}</strong> to confirm');
  expect(view).toContain('deleteConfirmation !== `DELETE V${pendingAction.version}`');
  expect(view).toContain('onClick={()=>requestAction("delete",revision.version)}');
  expect(view).toContain('else void deleteVersion(version)');
  const restore=read("./restoreSavedReactVersion.ts");
  expect(restore).toContain("createRevision: false");
 });
 it("server deletes only owner-scoped unreferenced non-current snapshots",()=>{
  const route=read("../../app/api/build/projects/[buildProjectId]/source-history/route.ts");
  expect(route).toContain("export async function DELETE");
  expect(route).toContain("enforceSameOriginPost(req)");
  expect(route).toContain("activeSavedHistoryVersion(expectedVersion,owned.codeProject.meta)");
  expect(route).toContain("tx.buildDeployment.findFirst");
  expect(route).toContain("tx.buildRun.findFirst");
  expect(route).toContain("tx.buildArtifact.findFirst");
  expect(route).toContain("Prisma.TransactionIsolationLevel.Serializable");
 });
 it("shows a plain-language fallback only after automatic recovery cannot complete",()=>{
  const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
  expect(shell).toContain("dependencyRecoveryNeedsAttention");
  expect(shell).toContain('data-testid="zoebuild-dependency-recovery-help"');
  expect(shell).toContain("We couldn't prepare this preview");
  expect(shell).toContain("!dependencyRecoveryNeedsAttention");
  expect(shell).not.toContain("Approve and prepare dependencies");
  expect(shell).not.toContain("Review saved package.json");
 });
});
