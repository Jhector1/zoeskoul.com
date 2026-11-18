import { afterEach, describe, expect, it, vi } from "vitest";
// Avoid connecting to Docker in reattachment tests: readiness probes are
// separately covered by the preview transport tests.
vi.mock("./tanstackPreviewDockerTransport.js", () => ({
  fetchTanstackHttpInsideSandbox: vi.fn(async () => ({
    status:200,headers:{"content-type":"text/html"},bodyBase64:"",
  })),
  retireTanstackHttpWorker:vi.fn(async()=>undefined),
}));
import { randomUUID } from "node:crypto";
import { env } from "../../lib/env.js";
import { PROJECT_DEPENDENCY_APPROVAL_PATH } from "@zoeskoul/build-preparation";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { trustedTanstackDevelopmentWorkspaces } from "./tanstackDevelopmentWorkspaceStore.js";
import { startAdmittedTanstackPreview, startAdmittedTanstackDevelopmentPreview,
  fetchAdmittedTanstackPreview, fetchOwnedTanstackPreview,
  resolveAdmittedTanstackPreviewCapability, verifyAdmittedTanstackPreviewReady,
} from "./tanstackPreviewSharedLifecycle.js";

const request = { operation:"production-build" as const, protocolVersion:1 as const,
  buildProjectId:"project", sourceVersion:7, stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
  files:[{path:"package.json",content:"{}"}] };
const identity = { sourceFingerprint:"source-7", dependencyFingerprint:"deps",
  runtimeImageId:`sha256:${"c".repeat(64)}`,fingerprint:"fp-7" };
const page = {status:200,headers:{"content-type":"text/html"},bodyBase64:Buffer.from("<html><head></head><body>ready</body></html>").toString("base64")};
function makeDriver() {
  const id = randomUUID();
  const workspaceDir = `${env.workspaceRoot}/zoeskoul-run-${id}`;
  const destroy = vi.fn(async () => undefined);
  const cleanup = vi.fn(async () => undefined);
  return {workspaceDir,destroy,cleanup,driver:{prepare:async()=>workspaceDir,
    launch:async()=>"b".repeat(64), probe:async()=>page,
    destroy,cleanup,now:()=>1,sleep:async()=>undefined}};
}
afterEach(async()=>{
  for(const lease of sharedFullStackPreviews.list()) await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests();
});
describe("development lease minting remains internal", () => {
  it("existing start path stays immutable and has no trusted writable handle",async()=>{
    const d = makeDriver();
    const started=await startAdmittedTanstackPreview({ ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>d.driver });
    const lease=sharedFullStackPreviews.get(started.previewId)!;
    expect(lease.mode).toBe("immutable");
    expect(trustedTanstackDevelopmentWorkspaces.resolve(lease)).toBeNull();
  });
  it("mints a driver-owned handle after readiness and revokes only after close",async()=>{
    const d=makeDriver();
    const started=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>d.driver});
    const lease=sharedFullStackPreviews.get(started.previewId)!;
    expect(lease.mode).toBe("development");
    expect(trustedTanstackDevelopmentWorkspaces.resolve(lease)).toMatchObject({
      previewId:started.previewId,workspaceRoot:env.workspaceRoot,
      workspaceDir:d.workspaceDir, sourceVersion:7,identityFingerprint:"fp-7",
    });
    await expect(fetchAdmittedTanstackPreview({previewId:started.previewId,
      path:started.basePath,method:"GET"})).rejects.toThrow("Preview not found.");
    expect(()=>resolveAdmittedTanstackPreviewCapability({previewId:started.previewId,
      path:started.basePath})).toThrow("Preview not found.");
    await expect(fetchOwnedTanstackPreview({ownerKey:"actor",previewId:started.previewId,
      buildProjectId:"project",sourceVersion:7,path:started.basePath,method:"GET"}))
      .rejects.toThrow("Preview not found.");
    expect(await verifyAdmittedTanstackPreviewReady({ownerKey:"actor",preview:started})).toBe(false);
    await sharedFullStackPreviews.close(started.previewId);
    expect(trustedTanstackDevelopmentWorkspaces.resolve(lease)).toBeNull();
    expect(d.destroy).toHaveBeenCalledOnce();
    expect(d.cleanup).toHaveBeenCalledOnce();
  });
  it("authorization refusal prevents workspace handle registration",async()=>{
    const d=makeDriver();
    await expect(startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>{throw new Error("unauthorized")},driverFactory:()=>d.driver}))
      .rejects.toThrow("unauthorized");
    expect(sharedFullStackPreviews.count()).toBe(0);
    expect(d.destroy).not.toHaveBeenCalled();
  });
});

describe("Phase 4D readiness and non-destructive development startup", () => {
  it("checks authority twice and refuses a superseded revision after readiness",async()=>{
    const d=makeDriver();
    const authorize=vi.fn(async()=>{
      if(authorize.mock.calls.length === 2) throw Error("DB revision superseded");
    });
    await expect(startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize,driverFactory:()=>d.driver})).rejects.toThrow("DB revision superseded");
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(d.destroy).toHaveBeenCalledOnce();
    expect(d.cleanup).toHaveBeenCalledOnce();
    expect(sharedFullStackPreviews.count()).toBe(0);
  });
  it("replaces a development lease whose trusted identity cannot be reattached",async()=>{
    const firstDriver=makeDriver();
    const first=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>firstDriver.driver});
    const secondDriver=makeDriver();
    const second=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>secondDriver.driver});
    expect(second.previewId).not.toBe(first.previewId);
    expect(sharedFullStackPreviews.get(first.previewId)).toBeNull();
    expect(sharedFullStackPreviews.get(second.previewId)?.mode).toBe("development");
    expect(firstDriver.destroy).toHaveBeenCalledOnce();
  });
  it("development startup transitions an owned immutable preview in one slot",async()=>{
    const firstDriver=makeDriver();
    const first=await startAdmittedTanstackPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>firstDriver.driver});
    const secondDriver=makeDriver();
    const second=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>secondDriver.driver});
    expect(sharedFullStackPreviews.get(first.previewId)).toBeNull();
    expect(sharedFullStackPreviews.get(second.previewId)?.mode).toBe("development");
    expect(firstDriver.destroy).toHaveBeenCalledOnce();
  });
  it("reauthorizes immediately before an owned mode transition",async()=>{
    const firstDriver=makeDriver();
    await startAdmittedTanstackPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>firstDriver.driver});
    const authorize=vi.fn(async()=>undefined);
    firstDriver.destroy.mockImplementationOnce(async()=>{
      expect(authorize).toHaveBeenCalledTimes(2);
    });
    const secondDriver=makeDriver();
    await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize,driverFactory:()=>secondDriver.driver});
    // Initial admission, destructive transition, and post-readiness publish.
    expect(authorize).toHaveBeenCalledTimes(3);
  });
  it("immutable fallback cannot destroy a healthy development lease",async()=>{
    const developmentDriver=makeDriver();
    const development=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>developmentDriver.driver});
    const fallbackDriver=makeDriver();
    await expect(startAdmittedTanstackPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>fallbackDriver.driver}))
      .rejects.toThrow("Healthy development preview owns");
    expect(sharedFullStackPreviews.get(development.previewId)?.mode).toBe("development");
    expect(developmentDriver.destroy).not.toHaveBeenCalled();
    expect(fallbackDriver.destroy).not.toHaveBeenCalled();
  });
  it("settles an incremental update before judging development health",async()=>{
    const developmentDriver=makeDriver();
    const development=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>developmentDriver.driver});
    let release!:()=>void;
    const update=sharedFullStackPreviews.withDevelopmentUpdate(development.previewId,async()=>
      new Promise<void>(resolve=>{release=resolve;}));
    await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
    vi.mocked(fetchTanstackHttpInsideSandbox).mockClear();
    const fallback=startAdmittedTanstackPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>makeDriver().driver});
    await Promise.resolve();
    const healthChecksBeforeSettle=vi.mocked(fetchTanstackHttpInsideSandbox).mock.calls.length;
    const destroysBeforeSettle=developmentDriver.destroy.mock.calls.length;
    release();await update;
    await expect(fallback).rejects.toThrow("Healthy development preview owns");
    expect(healthChecksBeforeSettle).toBe(0);
    expect(destroysBeforeSettle).toBe(0);
    expect(developmentDriver.destroy).not.toHaveBeenCalled();
  });
});


describe("Phase 4F5H3 authorized development lease reattachment",()=>{
  const source={...request,files:[
    {path:"package.json",content:"{}"},
    {path:"pnpm-lock.yaml",content:"lockfileVersion: 9.0"},
    {path:PROJECT_DEPENDENCY_APPROVAL_PATH,content:"approved"},
  ]};
  const exactIdentity=createTanstackPreviewIdentity(source,`sha256:${"c".repeat(64)}`);
  it("reuses an exact authorized live lease without launching a second container",async()=>{
    const firstDriver=makeDriver();
    const authorize=vi.fn(async()=>undefined);
    const input={ownerKey:"actor",request:source,identity:exactIdentity,
      authorize,driverFactory:()=>firstDriver.driver};
    const first=await startAdmittedTanstackDevelopmentPreview(input);
    const unusedDriver=makeDriver();
    const second=await startAdmittedTanstackDevelopmentPreview({
      ...input,driverFactory:()=>unusedDriver.driver,
    });
    expect(second).toEqual(first);
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(sharedFullStackPreviews.snapshot().totalReserved).toBe(1);
    expect(firstDriver.destroy).not.toHaveBeenCalled();
    expect(unusedDriver.destroy).not.toHaveBeenCalled();
  });
  it("replaces a mismatched saved revision only after authoritative admission",async()=>{
    const d=makeDriver();
    const input={ownerKey:"actor",request:source,identity:exactIdentity,
      authorize:async()=>undefined,driverFactory:()=>d.driver};
    const first=await startAdmittedTanstackDevelopmentPreview(input);
    const wrong={...source,sourceVersion:source.sourceVersion+1};
    const unused=makeDriver();
    const replaced=await startAdmittedTanstackDevelopmentPreview({...input,
      request:wrong,identity:createTanstackPreviewIdentity(wrong,exactIdentity.runtimeImageId),
      driverFactory:()=>unused.driver,
    });
    expect(replaced.sourceVersion).toBe(wrong.sourceVersion);
    expect(sharedFullStackPreviews.get(first.previewId)).toBeNull();
    expect(d.destroy).toHaveBeenCalledOnce();
    expect(unused.destroy).not.toHaveBeenCalled();
  });
  it("reauthorizes after health and rejects a changed authoritative source",async()=>{
    const d=makeDriver();
    const input={ownerKey:"actor",request:source,identity:exactIdentity,
      authorize:async()=>undefined,driverFactory:()=>d.driver};
    const first=await startAdmittedTanstackDevelopmentPreview(input);
    const authorize=vi.fn(async()=>{if(authorize.mock.calls.length===2)throw Error("source superseded")});
    await expect(startAdmittedTanstackDevelopmentPreview({...input,authorize}))
      .rejects.toThrow("source superseded");
    expect(sharedFullStackPreviews.get(first.previewId)?.mode).toBe("development");
  });
  it("waits for an active update instead of destroying a healthy lease",async()=>{
    const d=makeDriver();
    const input={ownerKey:"actor",request:source,identity:exactIdentity,
      authorize:vi.fn(async()=>undefined),driverFactory:()=>d.driver};
    const first=await startAdmittedTanstackDevelopmentPreview(input);
    let release!:()=>void;
    const update=sharedFullStackPreviews.withDevelopmentUpdate(first.previewId,async()=>
      new Promise<void>(resolve=>{release=resolve;}));
    await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
    const reattach=startAdmittedTanstackDevelopmentPreview(input);
    await Promise.resolve();
    expect(d.destroy).not.toHaveBeenCalled();
    release();await update;
    expect((await reattach).previewId).toBe(first.previewId);
    expect(d.destroy).not.toHaveBeenCalled();
  });
  it("never replaces a newer development revision with a stale request",async()=>{
    const d=makeDriver();
    const newer={...source,sourceVersion:source.sourceVersion+1};
    const newerIdentity=createTanstackPreviewIdentity(newer,exactIdentity.runtimeImageId);
    const first=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request:newer,
      identity:newerIdentity,authorize:async()=>undefined,driverFactory:()=>d.driver});
    await expect(startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request:source,
      identity:exactIdentity,authorize:async()=>undefined,driverFactory:()=>makeDriver().driver}))
      .rejects.toThrow("stale");
    expect(sharedFullStackPreviews.get(first.previewId)?.sourceVersion).toBe(newer.sourceVersion);
    expect(d.destroy).not.toHaveBeenCalled();
  });
});
