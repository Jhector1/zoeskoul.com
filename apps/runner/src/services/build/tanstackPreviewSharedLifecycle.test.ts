import {afterEach,describe,expect,it,vi} from "vitest";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { startAdmittedTanstackPreview, stopAdmittedTanstackPreview } from "./tanstackPreviewSharedLifecycle.js";

vi.mock("./reactPreviewRuntime.js",()=>({
  reserveReactPreviewCapacityForSharedRuntime:vi.fn(()=>()=>{}),
  reclaimReactPreviewCapacityForSharedRuntime:vi.fn(async()=>{}),
}));
const request={operation:"production-build" as const,protocolVersion:1 as const,
  buildProjectId:"project123",sourceVersion:4,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
  files:[{path:"package.json",content:"{}"}]};
const page={status:200,headers:{"content-type":"text/html"},
  bodyBase64:Buffer.from("<html><head></head><body>Ready</body></html>").toString("base64")};
const steps:string[]=[];
const driver={prepare:async()=>{steps.push("prepare");return "/tmp/workspace";},
  launch:async()=>{steps.push("launch");return "container";},
  probe:async()=>page,
  destroy:async()=>{steps.push("destroy")},cleanup:async()=>{steps.push("cleanup")},
  now:()=>1,sleep:async()=>{},};
afterEach(async()=>{
  for(const lease of sharedFullStackPreviews.list()) await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests(); steps.length=0;
});
describe("TanStack preview uses the shared Runner admission",()=>{
  it("refuses execution before server-verified source authorization",async()=>{
    await expect(startAdmittedTanstackPreview({ownerKey:"owner",request,
      authorize:async()=>{throw Error("Unapproved dependencies")},driverFactory:()=>driver})).rejects.toThrow("Unapproved");
    expect(steps).toEqual([]);
  });
  it("accounts for a ready SSR server until verified teardown",async()=>{
    const result=await startAdmittedTanstackPreview({ownerKey:"owner",request,
      authorize:async()=>{},driverFactory:()=>driver});
    expect(result.port).toBe(5173);
    expect(sharedFullStackPreviews.count()).toBe(1);
    await expect(stopAdmittedTanstackPreview("other",result.previewId)).rejects.toThrow("Forbidden");
    expect(sharedFullStackPreviews.count()).toBe(1);
    await stopAdmittedTanstackPreview("owner",result.previewId);
    expect(sharedFullStackPreviews.count()).toBe(0);
    expect(steps).toContain("destroy");
    expect(steps).toContain("cleanup");
  });
  it("does not start an older version over a live newer version",async()=>{
    const newer=await startAdmittedTanstackPreview({ownerKey:"owner",request,
      authorize:async()=>{},driverFactory:()=>driver});
    await expect(startAdmittedTanstackPreview({ownerKey:"owner",
      request:{...request,sourceVersion:3},authorize:async()=>{},driverFactory:()=>driver})).rejects.toThrow("stale");
    expect(sharedFullStackPreviews.get(newer.previewId)).not.toBeNull();
  });
});
