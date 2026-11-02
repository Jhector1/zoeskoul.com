import { describe, expect, it } from "vitest";
import { startIsolatedTanstackPreview, stopIsolatedTanstackPreview, TanstackPreviewCleanupError, type TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";

const good = {status:200,headers:{"content-type":"text/html"},
  bodyBase64:Buffer.from("<html><head></head><body>ok</body></html>").toString("base64")};

function fakeDriver(steps: string[], mode:"ready"|"never"|"launch-fail"|"install-fail"="ready") {
  let tick = 0;
  return { prepare: async()=> {steps.push("prepare");if(mode==="install-fail") throw Error("install failed");return "/temp/project";},
    launch: async()=> {steps.push("launch");if(mode==="launch-fail")throw Error("launch failed");return "docker123";},
    probe: async()=>{steps.push("probe");return mode==="ready"?good:{...good,status:503};},
    destroy: async()=>{steps.push("destroy");}, cleanup: async()=>{steps.push("cleanup");},
    now:()=>tick, sleep:async (ms:number)=>{tick+=ms;},
  } satisfies TanstackPreviewDriver;
}

describe("TanStack preview lifecycle without a second capacity registry",()=>{
  it("returns only after actual SSR readiness and stops cleanly", async()=>{
    const steps:string[]=[];const driver=fakeDriver(steps);
    const handle=await startIsolatedTanstackPreview(driver);
    expect(handle).toEqual({containerId:"docker123",workspaceDir:"/temp/project"});
    await stopIsolatedTanstackPreview(driver,handle);
    expect(steps).toEqual(["prepare","launch","probe","destroy","cleanup"]);
  });
  it("destroys resources if SSR never becomes ready", async()=>{
    const steps:string[]=[];
    await expect(startIsolatedTanstackPreview(fakeDriver(steps,"never"),{timeoutMs:1600})).rejects.toThrow("did not become ready");
    expect(steps.slice(-2)).toEqual(["destroy","cleanup"]);
  });
  it("cleans the workspace after Docker launch failure", async()=>{
    const steps:string[]=[];
    await expect(startIsolatedTanstackPreview(fakeDriver(steps,"launch-fail"))).rejects.toThrow("launch failed");
    expect(steps).toEqual(["prepare","launch","cleanup"]);
  });
  it("never launches after cancellation",async()=>{
    const steps:string[]=[];const controller=new AbortController(); controller.abort();
    await expect(startIsolatedTanstackPreview(fakeDriver(steps),{signal:controller.signal})).rejects.toThrow("cancelled");
    expect(steps).toEqual([]);
  });
});


describe("TanStack orphaned startup cleanup", () => {
  it("preserves a retryable orphan when readiness fails and Docker teardown fails", async () => {
    const steps: string[] = [];
    const driver = fakeDriver(steps, "never");
    let attempts = 0;
    const failing: TanstackPreviewDriver = {
      ...driver,
      destroy: async (id) => {
        steps.push("destroy");
        if (++attempts === 1) throw new Error("Docker unavailable");
      },
    };
    const error = await startIsolatedTanstackPreview(failing, {timeoutMs: 1600}).then(
      () => { throw new Error("Expected startup failure"); },
      err => err,
    );
    expect(error).toBeInstanceOf(TanstackPreviewCleanupError);
    expect(error.orphan.containerId).toBe("docker123");
    expect(error.orphan.workspaceDir).toBeNull();
    await error.recover();
    expect(attempts).toBe(2);
    expect(steps).toContain("cleanup");
  });

  it("preserves cleanup recovery from a failure inside driver prepare", async () => {
    const orphan = new TanstackPreviewCleanupError(
      {containerId:null,workspaceDir:"/tmp/failed-preparation"},async()=>{},new Error("install failed"));
    const failing:TanstackPreviewDriver={...fakeDriver([]),prepare:async()=>{throw orphan;}};
    const error = await startIsolatedTanstackPreview(failing).then(
      () => {throw new Error("Expected failure");},err=>err,
    );
    expect(error).toBeInstanceOf(TanstackPreviewCleanupError);
    expect(error.orphan.workspaceDir).toBe("/tmp/failed-preparation");
    await expect(error.recover()).resolves.toBeUndefined();
  });
});
