import { describe, expect, it } from "vitest";
import { startIsolatedTanstackPreview, stopIsolatedTanstackPreview, TanstackPreviewCleanupError, TanstackPreviewReadinessError, type TanstackPreviewDriver } from "./tanstackPreviewLifecycle.js";
import { PreviewObservability } from "./previewObservability.js";

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
  it("reports readiness and first SSR from the same process clock without changing control flow", async()=>{
    let now=0;
    const metrics=new PreviewObservability(()=>now);
    const telemetry=metrics.beginOperation({startKind:"cold",reuseCandidate:false});
    const driver=fakeDriver([]);
    const measured:TanstackPreviewDriver={...driver,probe:async()=>{now=12;return good;}};
    await expect(startIsolatedTanstackPreview(measured,{telemetry})).resolves.toEqual({
      containerId:"docker123",workspaceDir:"/temp/project",
    });
    telemetry.finish("ok");
    expect(telemetry.snapshot().stages.vite_readiness).toEqual({outcome:"ok",durationMs:12});
    expect(telemetry.snapshot().stages.first_ssr).toEqual({outcome:"ok",durationMs:12});
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


describe("P3B5D sanitized TanStack readiness telemetry", () => {
  it("records bounded HTTP status without emitting the response body", async () => {
    const steps: string[] = [];
    const error = await startIsolatedTanstackPreview(fakeDriver(steps, "never"),
      { timeoutMs: 1600 }).then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(TanstackPreviewReadinessError);
    if (!(error instanceof TanstackPreviewReadinessError)) {
      throw new Error("Expected a sanitized TanStack readiness error.");
    }
    expect(error.diagnostic).toEqual({
      result: "http_status", attempts: 2, lastHttpStatus: 503, elapsedMs: 1600,
    });
  });

  it("classifies probe exceptions without including private exception messages", async () => {
    let tick = 0;
    const driver: TanstackPreviewDriver = {
      ...fakeDriver([]),
      probe: async () => { throw new Error("secret-token-and-user-source"); },
      now: () => tick,
      sleep: async (ms) => { tick += ms; },
    };
    const error = await startIsolatedTanstackPreview(driver,
      { timeoutMs: 800 }).then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(TanstackPreviewReadinessError);
    if (!(error instanceof TanstackPreviewReadinessError)) {
      throw new Error("Expected a sanitized TanStack readiness error.");
    }
    expect(error.diagnostic).toEqual({
      result: "transport_error", attempts: 1, lastHttpStatus: null, elapsedMs: 800,
    });
    expect(error.message).not.toContain("secret-token");
  });

  it("attributes a readiness failure and leaves later stages unavailable", async () => {
    let now=0;
    const metrics=new PreviewObservability(()=>now);
    const telemetry=metrics.beginOperation({startKind:"restart",reuseCandidate:false});
    const driver:TanstackPreviewDriver={...fakeDriver([],"never"),now:()=>now,
      sleep:async(ms)=>{now+=ms;}};
    await expect(startIsolatedTanstackPreview(driver,{timeoutMs:800,telemetry})).rejects.toThrow("ready");
    telemetry.finish("error");
    expect(telemetry.snapshot().stages.vite_readiness).toEqual({outcome:"error",durationMs:800});
    expect(telemetry.snapshot().stages.first_ssr).toEqual({outcome:"error",durationMs:800});
    expect(telemetry.snapshot().stages.operation_total.outcome).toBe("error");
  });
});
