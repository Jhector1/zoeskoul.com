import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {historySwitchHasSettled} from "./historySwitchReadiness";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("saved version selection is idempotent and hides stale previews",()=>{
 it("does not release the overlay for an older ready preview",()=>{
  expect(historySwitchHasSettled({expectedSourceVersion:21,hydratedSourceVersion:21,acknowledgedSourceVersion:20,attemptedSourceVersion:20,previewState:"ready"})).toBe(false);
  expect(historySwitchHasSettled({expectedSourceVersion:21,hydratedSourceVersion:21,acknowledgedSourceVersion:21,attemptedSourceVersion:21,previewState:"syncing"})).toBe(false);
  expect(historySwitchHasSettled({expectedSourceVersion:21,hydratedSourceVersion:21,acknowledgedSourceVersion:21,attemptedSourceVersion:21,previewState:"ready"})).toBe(true);
  expect(historySwitchHasSettled({expectedSourceVersion:21,hydratedSourceVersion:20,acknowledgedSourceVersion:21,attemptedSourceVersion:21,previewState:"ready"})).toBe(false);
  expect(historySwitchHasSettled({expectedSourceVersion:21,hydratedSourceVersion:21,acknowledgedSourceVersion:null,attemptedSourceVersion:21,previewState:"error"})).toBe(true);
 });
 it("has a bounded transition failure and requires a deliberate retry",()=>{
  const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
  expect(shell).toContain("sourceVersion === null ? 45_000 : 145_000");
  expect(shell).toContain("current.sourceVersion === sourceVersion && !current.failed");
  const overlay=read("../../app/[locale]/projects/[buildProjectId]/HistoryPreviewTransition.tsx");
  const copy=read("./historyPreviewTransitionCopy.ts");
  expect(overlay).toContain('>Retry preview</button>');
  expect(overlay).toContain('>Reload saved project</button>');
  expect(copy).toContain("The previous preview remains hidden");
 });
 it("switches exact snapshots without appending duplicate revisions",()=>{
  const source=read("./restoreSavedReactVersion.ts");
  expect(source).toContain("createRevision: false");
  expect(source).not.toContain("createRevision: true");
  expect(source).toContain("if (activeVersion === args.restoreVersion)");
  expect(source).toContain("baseVersion: args.expectedVersion");
  expect(source).toContain("Prisma.TransactionIsolationLevel.Serializable");
 });
 it("blocks stale editor and runner content during switch",()=>{
  const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
  const hook=read("../../components/builder/useReactVitePreview.ts");
  expect(shell).toContain("<HistoryPreviewTransition");
  expect(read("../../app/[locale]/projects/[buildProjectId]/HistoryPreviewTransition.tsx"))
    .toContain('data-testid="zoebuild-history-switch-overlay"');
  expect(shell).toContain("confirmedSourceVersion !== previewSourceVersion");
  expect(shell).toContain("onSwitchStart=");
  expect(shell).toContain("onSwitchFailure=");
  expect(hook).toContain("setConfirmedSourceVersion(sendingVersion)");
 });
});
