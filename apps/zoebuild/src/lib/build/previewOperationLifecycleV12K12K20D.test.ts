import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
const root=process.cwd();
const read=(relative:string)=>readFileSync(path.resolve(root,"src",relative),"utf8");
describe("K20D preview operation handshake",()=>{
 it("starts in the runner without waiting for the full dependency install",()=>{
   const start=read("app/api/build/projects/[buildProjectId]/preview/start/route.ts");
   expect(start).toContain("submitTrustedReactPreviewOperationAtRunner");
   expect(start).toContain("202");
 });
 it("fences status to authenticated ownership and the current saved source",()=>{
   const status=read("app/api/build/projects/[buildProjectId]/preview/operations/[operationId]/route.ts");
   expect(status).toContain("loadCurrentBuildAccessSnapshot");
   expect(status).toContain("requireOwnedReactPreviewProject");
   expect(status).toContain("afterDocument.sourceVersion !== project.sourceVersion");
   expect(status).toContain("proxyFetchTrustedReactPreviewAtRunner");
 });
 it("polls a bounded durable operation instead of aborting an active installation",()=>{
   const hook=read("components/builder/useReactVitePreview.ts");
   expect(hook).toContain("PREVIEW_OPERATION_TIMEOUT_MS = 6 * 60_000");
   expect(hook).toContain("PREVIEW_OPERATION_POLL_INTERVAL_MS = 2_000");
   expect(hook).toContain('current.state === "ready"');
   expect(hook).toContain("supersededDuringStart = true");
   expect(hook).toContain("operation.sourceVersion !== startingVersion");
 });
});
