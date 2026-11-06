import {afterEach,describe,expect,it,vi} from "vitest";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { reuseAdmittedTanstackPreview, startAdmittedTanstackPreview, stopAdmittedTanstackPreview } from "./tanstackPreviewSharedLifecycle.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";

vi.mock("./tanstackPreviewDockerTransport.js",()=>({fetchTanstackHttpInsideSandbox:vi.fn()}));

const request={operation:"production-build" as const,protocolVersion:1 as const,
  buildProjectId:"project123",sourceVersion:4,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
  files:[{path:"package.json",content:"{}"}]};
const page={status:200,headers:{"content-type":"text/html"},
  bodyBase64:Buffer.from("<html><head></head><body>Ready</body></html>").toString("base64")};
const steps:string[]=[];
const identity={sourceFingerprint:"source",dependencyFingerprint:"dependencies",
  runtimeImageId:`sha256:${"a".repeat(64)}`,fingerprint:"identity"} as const;
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
    await expect(startAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{throw Error("Unapproved dependencies")},driverFactory:()=>driver})).rejects.toThrow("Unapproved");
    expect(steps).toEqual([]);
  });
  it("accounts for a ready SSR server until verified teardown",async()=>{
    let mintedBase: string | null = null;
    const result=await startAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{},driverFactory:(_request, basePath)=>{ mintedBase = basePath;
        expect(sharedFullStackPreviews.count()).toBe(0); return driver; }});
    expect(mintedBase).toBe(result.basePath);
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
    const newer=await startAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{},driverFactory:()=>driver});
    await expect(startAdmittedTanstackPreview({ownerKey:"owner",
      request:{...request,sourceVersion:3},identity,
      authorize:async()=>{},driverFactory:()=>driver})).rejects.toThrow("stale");
    expect(sharedFullStackPreviews.get(newer.previewId)).not.toBeNull();
  });
  it("freshly health-checks and reuses the exact lease with zero new prepare or launch",async()=>{
    vi.mocked(fetchTanstackHttpInsideSandbox).mockResolvedValue(page);
    const first=await startAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{},driverFactory:()=>driver});
    const reused=await reuseAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{}});
    expect(reused?.previewId).toBe(first.previewId);
    expect(steps.filter(step=>step==="prepare")).toHaveLength(1);
    expect(steps.filter(step=>step==="launch")).toHaveLength(1);
    expect(fetchTanstackHttpInsideSandbox).toHaveBeenCalledTimes(1);
  });
});


describe("failed startup quarantine", () => {
  it("keeps a leaked container counted and non-routable until cleanup succeeds", async () => {
    let destroys = 0;
    const failingDriver = {
      ...driver,
      probe: async () => ({...page, status: 503}),
      now: (() => {let tick=0;return ()=>tick;})(),
      sleep: async () => {},
      destroy: async () => {destroys++;if (destroys < 3) throw Error("daemon unavailable");},
    };
    // Cancel immediately after launch to avoid the readiness timeout.
    const controller = new AbortController();
    const abortDriver = {...failingDriver, launch: async () => {
      controller.abort();return "container-orphan";
    }};
    await expect(startAdmittedTanstackPreview({ownerKey:"owner",request,identity,
      authorize:async()=>{},signal:controller.signal,driverFactory:()=>abortDriver}))
      .rejects.toThrow("reconciliation");
    expect(destroys).toBe(1);
    expect(sharedFullStackPreviews.count()).toBe(1);
    const orphan = sharedFullStackPreviews.list()[0];
    expect(orphan.basePath.startsWith("/quarantined/")).toBe(true);
    expect(orphan.containerId).toBe("container-orphan");
    await expect(sharedFullStackPreviews.close(orphan.id)).rejects.toThrow("incomplete");
    expect(sharedFullStackPreviews.count()).toBe(1);
    // Explicit verified recovery frees the slot, never startup failure alone.
    await sharedFullStackPreviews.close(orphan.id);
    expect(sharedFullStackPreviews.count()).toBe(0);
  });
});
