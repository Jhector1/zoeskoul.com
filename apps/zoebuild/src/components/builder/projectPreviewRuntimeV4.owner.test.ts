import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(resolve(__dirname, "../../..",p),"utf8");
describe("ZoeBuild project preview runtime V4",()=>{
 const hook=read("src/components/builder/useReactVitePreview.ts");
 const client=read("src/app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx");
 const host=read("src/components/builder/PersistentReactPreviewHost.tsx");
 const runner=read("../runner/src/services/build/reactPreviewRuntime.ts");
 it("uses one browser owner across Preview and Code",()=>{
  expect(host.match(/<RemoteWebPreview/g)?.length??0).toBe(1);
  expect(client).toContain('slotId="code-preview"');
  expect(client).toContain("remoteWebPreviewSurface={");
 });
 it("syncs semantic file content, not workspace identity/sourceVersion",()=>{
  expect(hook).toContain("workspaceSyncEntriesEqual");
  expect(hook).toContain("workspaceContentRevision");
  expect(hook).not.toContain("[input.enabled, input.sourceVersion, input.workspace, restart, syncCurrent]");
 });
 it("refreshes only after semantic guard and successful sync",()=>{
  const a=hook.indexOf("workspaceSyncEntriesEqual(",hook.indexOf("const syncCurrent"));
  const b=hook.indexOf("/sync`",a), c=hook.indexOf("current.revision + 1",b);
  expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
 });
 it("keeps runner warm reuse before cold capacity",()=>{
  const a=runner.indexOf("await reuseExistingProjectPreview(");
  const b=runner.indexOf("reservePreviewCapacity(",a);
  expect(a).toBeGreaterThan(-1); expect(b).toBeGreaterThan(a);
 });
 it("restarts only at dependency/dead/expired lifecycle boundaries",()=>{
  expect(runner).toContain("Preview dependencies changed. Restart the preview.");
  expect(runner).toContain("PREVIEW_IDLE_MS");
  expect(runner).toContain("PREVIEW_HARD_LIFETIME_MS");
  expect(hook).toContain('"PREVIEW_RESTART_REQUIRED"');
 });
});
