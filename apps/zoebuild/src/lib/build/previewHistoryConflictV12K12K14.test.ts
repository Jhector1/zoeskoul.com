import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
function read(rel:string){return readFileSync(new URL(rel,import.meta.url),"utf8");}
describe("K14 preview/history source-conflict recovery",()=>{
 it("recognizes stale history conflicts in trusted bootstrap and reconciles before denying",()=>{
  const hook=read("../../components/builder/useReactVitePreview.ts");
  expect(hook).toContain('bootstrapData?.code === "BUILD_HISTORY_STALE"');
  expect(hook).toContain('if (await reconcileConflict(startingVersion)) return;');
  expect(hook).toContain('console.warn("[ZoeBuild preview] dependency preparation rejected"');
  expect(hook).toContain('requestId: bootstrapData?.requestId');
  expect(hook).not.toContain('console.warn("[ZoeBuild preview] dependency preparation rejected", bootstrapData');
 });
 it("never silently repeats an owner-confirmed restore on a stale head",()=>{
  const history=read("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
  expect(history).toContain('data?.code === "BUILD_HISTORY_STALE"');
  expect(history).toContain('await props.onStaleSource?.(props.currentVersion)');
  expect(history).toContain('await refreshHistoryAfterConflict()');
  expect(history).toContain('Saved versions were refreshed');
  expect(history).not.toContain('await restoreVersion(version)');
 });
 it("connects history stale events to the parent authoritative reader",()=>{
  const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
  expect(shell).toContain('onStaleSource={reconcileStalePreview}');
 });
});
