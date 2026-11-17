import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { docker } from "../docker/dockerClient.js";
import { applySuspendedTanstackDevelopmentSource } from "./tanstackDevelopmentWorkspaceWriter.js";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { TrustedTanstackDevelopmentSourceStore } from "./tanstackDevelopmentSourceStore.js";
import { TrustedTanstackDevelopmentWorkspaceStore } from "./tanstackDevelopmentWorkspaceStore.js";
import { updateCanonicalTanstackDevelopmentPreview } from "./tanstackDevelopmentCanonicalUpdate.js";

vi.mock("../docker/dockerClient.js", () => ({docker:{getContainer:vi.fn()}}));
vi.mock("./tanstackDevelopmentWorkspaceWriter.js", () => ({
  applySuspendedTanstackDevelopmentSource:vi.fn(),
}));
vi.mock("./tanstackPreviewSourceAuthorization.js", () => ({
  authorizeTanstackPreviewSource:vi.fn(),
}));

const CID = "f".repeat(64);
const IMAGE = `sha256:${"a".repeat(64)}`;
const ROOT = "/private/zoebuild";
const DIR = `${ROOT}/zoeskoul-run-${randomUUID()}`;
function request(sourceVersion:number, body:string):ProductionBuildJobRequestV1 {
  return {protocolVersion:1,operation:"production-build",buildProjectId:"p",
    sourceVersion,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
    files:[
      {path:"package.json",content:'{"private":true}'},
      {path:"pnpm-lock.yaml",content:"lockfileVersion: '9.0'\n"},
      {path:"zoebuild-dependency-approval.json",content:'{"signed":true}'},
      {path:"src/routes/index.tsx",content:body},
    ]};
}
function fixture(mode:"immutable"|"development"="development") {
  vi.resetAllMocks();
  const registry=new SharedFullStackPreviewRegistry();
  const sources=new TrustedTanstackDevelopmentSourceStore(registry);
  const workspaces=new TrustedTanstackDevelopmentWorkspaceStore(registry);
  const previewId=`preview_${randomUUID()}`;
  const previous=request(7,"first");
  const identity=createTanstackPreviewIdentity(previous,IMAGE);
  const close=vi.fn(async()=>undefined);
  registry.register({id:previewId,mode,ownerKey:"actor",buildProjectId:"p",
    sourceVersion:7,identity,containerId:CID,
    basePath:"/api/build/projects/p/preview/opaque/content/",
    createdAt:Date.now(),lastActivityAt:Date.now(),close});
  sources.registerFromAdmittedStart({previewId,ownerKey:"actor",buildProjectId:"p",
    containerId:CID,source:previous});
  workspaces.registerFromDriver({previewId,ownerKey:"actor",buildProjectId:"p",
    containerId:CID,workspaceRoot:ROOT,workspaceDir:DIR});
  vi.mocked(docker.getContainer).mockReturnValue({inspect:vi.fn(async()=>({
    Id:CID,State:{Running:true,Paused:false},
    Config:{Labels:{"com.zoeskoul.runner.purpose":"tanstack-start-preview"}},
    HostConfig:{NetworkMode:"none"},
    Mounts:[{Type:"bind",RW:true,Source:DIR,Destination:"/workspace"}],
  }))} as never);
  vi.mocked(applySuspendedTanstackDevelopmentSource).mockResolvedValue(undefined);
  const authorizeCurrentSavedSource=vi.fn(async()=>undefined);
  const update=(next:ProductionBuildJobRequestV1, overrides:Record<string,unknown>={})=>
    updateCanonicalTanstackDevelopmentPreview({registry,sources,workspaces,
      previewId,actorKey:"actor",next,authorizeCurrentSavedSource,
      ...overrides} as Parameters<typeof updateCanonicalTanstackDevelopmentPreview>[0]);
  return {registry,sources,workspaces,previewId,previous,close,
    authorizeCurrentSavedSource,update};
}
function gate() {
  let release!:()=>void;
  const promise=new Promise<void>(resolve=>{release=resolve;});
  return {promise,release};
}

describe("canonical development preview source CAS (not routed)",()=>{
  it("updates the registry and trusted snapshot together after an authorized write",async()=>{
    const f=fixture(); const next=request(8,"second");
    const result=await f.update(next);
    expect(result).toMatchObject({action:"updated",sourceVersion:8});
    expect(f.authorizeCurrentSavedSource).toHaveBeenCalledTimes(2);
    expect(applySuspendedTanstackDevelopmentSource).toHaveBeenCalledExactlyOnceWith({
      containerId:CID,workspaceRoot:ROOT,workspaceDir:DIR,
      changedPaths:["src/routes/index.tsx"],next,
    });
    const lease=f.registry.get(f.previewId)!;
    expect(lease.sourceVersion).toBe(8);
    expect(f.sources.resolve(lease)).toEqual(next);
  });

  it("resolves the latest canonical source after queuing and supports successive revisions",async()=>{
    const f=fixture();const next=request(8,"second");const later=request(9,"third");
    const hold=gate();
    vi.mocked(applySuspendedTanstackDevelopmentSource)
      .mockImplementationOnce(async()=>{await hold.promise;});
    const first=f.update(next);
    await vi.waitFor(()=>expect(applySuspendedTanstackDevelopmentSource).toHaveBeenCalledOnce());
    const second=f.update(later);
    expect(vi.mocked(applySuspendedTanstackDevelopmentSource).mock.calls.length).toBe(1);
    hold.release();
    await expect(first).resolves.toMatchObject({sourceVersion:8});
    await expect(second).resolves.toMatchObject({sourceVersion:9});
    const lease=f.registry.get(f.previewId)!;
    expect(f.sources.resolve(lease)).toEqual(later);
    expect(vi.mocked(applySuspendedTanstackDevelopmentSource)).toHaveBeenCalledTimes(2);
  });

  it("rejects stale duplicate updates without a second write",async()=>{
    const f=fixture();const next=request(8,"second");
    await f.update(next);
    await expect(f.update(next)).rejects.toThrow("Preview source is stale.");
    expect(applySuspendedTanstackDevelopmentSource).toHaveBeenCalledTimes(1);
    expect(f.sources.resolve(f.registry.get(f.previewId)!)).toEqual(next);
  });

  it("never rewrites an immutable lease or lets a different actor consult Docker",async()=>{
    const f=fixture("immutable");
    await expect(f.update(request(8,"second"))).rejects.toThrow("Preview not found.");
    const g=fixture();
    await expect(g.update(request(8,"second"),{actorKey:"attacker"}))
      .rejects.toThrow("Forbidden.");
    expect(docker.getContainer).not.toHaveBeenCalled();
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
  });

  it("requires both trusted source and workspace handles before writing",async()=>{
    const f=fixture();f.sources.revoke(f.previewId,CID);
    await expect(f.update(request(8,"second")))
      .rejects.toThrow("Development preview canonical source unavailable.");
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
    const g=fixture();g.workspaces.revoke(g.previewId,CID);
    await expect(g.update(request(8,"second"))).rejects.toThrow("Preview not found.");
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
  });

  it("dependency changes require restart without advancing the source snapshot",async()=>{
    const f=fixture();const proposed=request(8,"second");
    const dependency={...proposed,files:proposed.files.map(x=>x.path==="package.json"
      ? {...x,content:'{"private":true,"new":true}'}:x)};
    await expect(f.update(dependency)).resolves.toMatchObject({action:"restart_required"});
    expect(applySuspendedTanstackDevelopmentSource).not.toHaveBeenCalled();
    expect(f.registry.get(f.previewId)?.sourceVersion).toBe(7);
    expect(f.sources.resolve(f.registry.get(f.previewId)!)).toEqual(f.previous);
  });

  it("closes on post-write DB supersession without advancing trusted source",async()=>{
    const f=fixture();
    f.authorizeCurrentSavedSource.mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("superseded"));
    await expect(f.update(request(8,"second")))
      .rejects.toThrow("Development preview update failed.");
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.registry.get(f.previewId)).toBeNull();
  });

  it("quarantines a committed lease if source snapshot publication fails",async()=>{
    const f=fixture();
    const sources={resolve:(...args:Parameters<typeof f.sources.resolve>)=>f.sources.resolve(...args),
      advanceAfterCommittedLease:vi.fn(()=>{throw new Error("internal error");})};
    const close=vi.fn(async()=>{throw new Error("Docker unavailable");});
    const lease=f.registry.get(f.previewId)!;
    // Registry cannot replace close directly; use a fresh fixture and override
    // the registered lease's close callback in the same private registry.
    const registry=new SharedFullStackPreviewRegistry();
    registry.register({...lease,close});
    const trustedSources=new TrustedTanstackDevelopmentSourceStore(registry);
    trustedSources.registerFromAdmittedStart({previewId:f.previewId,ownerKey:"actor",
      buildProjectId:"p",containerId:CID,source:f.previous});
    const trustedWorkspaces=new TrustedTanstackDevelopmentWorkspaceStore(registry);
    trustedWorkspaces.registerFromDriver({previewId:f.previewId,ownerKey:"actor",
      buildProjectId:"p",containerId:CID,workspaceRoot:ROOT,workspaceDir:DIR});
    await expect(updateCanonicalTanstackDevelopmentPreview({registry,
      sources:{resolve:l=>trustedSources.resolve(l),
        advanceAfterCommittedLease:sources.advanceAfterCommittedLease},
      workspaces:trustedWorkspaces,previewId:f.previewId,actorKey:"actor",
      next:request(8,"second"),authorizeCurrentSavedSource:async()=>undefined}))
      .rejects.toThrow("Development preview update failed.");
    expect(close).toHaveBeenCalledOnce();
    expect(registry.get(f.previewId)?.basePath).toBe(`/quarantined/${f.previewId}/`);
    expect(trustedSources.resolve(registry.get(f.previewId)!)).toBeNull();
    expect(registry.snapshot().quarantined).toBe(1);
  });
});
