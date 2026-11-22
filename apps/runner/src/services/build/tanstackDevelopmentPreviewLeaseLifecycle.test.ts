import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { env } from "../../lib/env.js";
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
  it("refuses a second development lease without stopping the existing lease",async()=>{
    const firstDriver=makeDriver();
    const first=await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>firstDriver.driver});
    const secondDriver=makeDriver();
    await expect(startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>secondDriver.driver})).rejects.toThrow("already exists");
    expect(sharedFullStackPreviews.get(first.previewId)?.mode).toBe("development");
    expect(firstDriver.destroy).not.toHaveBeenCalled();
    expect(secondDriver.destroy).not.toHaveBeenCalled();
  });
  it("development startup cannot close an existing immutable preview",async()=>{
    const firstDriver=makeDriver();
    const first=await startAdmittedTanstackPreview({ownerKey:"actor",request,identity,
      authorize:async()=>undefined,driverFactory:()=>firstDriver.driver});
    const secondDriver=makeDriver();
    try {
      await startAdmittedTanstackDevelopmentPreview({ownerKey:"actor",request,identity,
        authorize:async()=>undefined,driverFactory:()=>secondDriver.driver});
    } catch (error) {
      // In a single-slot test environment, admission must reject without
      // evicting an existing immutable preview to make room.
      expect(String(error)).toMatch(/limit|capacity|busy|active/i);
    }
    expect(sharedFullStackPreviews.get(first.previewId)?.mode).toBe("immutable");
    expect(firstDriver.destroy).not.toHaveBeenCalled();
  });
});
