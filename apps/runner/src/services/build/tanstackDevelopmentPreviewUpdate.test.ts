import { describe, expect, it, vi } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { coordinateTanstackDevelopmentPreviewUpdate } from "./tanstackDevelopmentPreviewUpdate.js";
import { PreviewObservability } from "./previewObservability.js";

vi.mock("./tanstackPreviewSourceAuthorization.js", () => ({
  authorizeTanstackPreviewSource: vi.fn(),
}));
const image = `sha256:${"a".repeat(64)}`;
const basePath = "/api/build/projects/p/preview/preview_a/content/token/";
function request(version: number, text: string, extra: readonly {path:string;content:string}[] = []): ProductionBuildJobRequestV1 {
  return {
    protocolVersion:1, operation:"production-build",buildProjectId:"p",
    stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",sourceVersion:version,
    files:[
      {path:"package.json",content:'{"private":true}'},
      {path:"pnpm-lock.yaml",content:"lockfileVersion: '9.0'\n"},
      {path:"zoebuild-dependency-approval.json",content:'{"signed":true}'},
      {path:"src/routes/index.tsx",content:text},
      ...extra,
    ],
  };
}
const old = request(7,"old");
const next = request(8,"next");
function fixture(opts: {close?: () => Promise<void>;mode?:"immutable"|"development"} = {}) {
  const registry = new SharedFullStackPreviewRegistry();
  const observability = new PreviewObservability();
  const close = vi.fn(opts.close ?? (async () => undefined));
  registry.register({id:"preview_a",mode:opts.mode ?? "development",ownerKey:"actor",
    buildProjectId:"p",sourceVersion:7,identity:createTanstackPreviewIdentity(old,image),
    containerId:"container",basePath,createdAt:Date.now(),lastActivityAt:Date.now(),close});
  const authorize = vi.fn(async () => undefined);
  const healthy = vi.fn(async () => true);
  const apply = vi.fn(async (_args: unknown) => undefined);
  const update = (previous = old, subsequent = next, overrides: Record<string,unknown> = {}) =>
    coordinateTanstackDevelopmentPreviewUpdate({
      registry,observability,previewId:"preview_a",actorKey:"actor",previous,next:subsequent,
      authorizeCurrentSavedSource:authorize,verifyLiveWorkspace:healthy,
      applyApprovedSource:apply,...overrides,
    } as Parameters<typeof coordinateTanstackDevelopmentPreviewUpdate>[0]);
  return {registry,observability,close,authorize,healthy,apply,update};
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return {promise,release};
}

describe("serialized development preview update coordinator (not wired to HTTP)", () => {
  it("re-authorizes, verifies liveness and commits source+identity only after an accepted write", async () => {
    const f=fixture();
    const result=await f.update();
    expect(result).toMatchObject({action:"updated",sourceVersion:8,changedPaths:["src/routes/index.tsx"]});
    expect(f.authorize).toHaveBeenCalledTimes(2);
    expect(f.authorize).toHaveBeenCalledWith("actor",next);
    expect(f.healthy).toHaveBeenCalledOnce();
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.registry.get("preview_a")?.identity.sourceFingerprint)
      .toBe(createTanstackPreviewIdentity(next,image).sourceFingerprint);
    expect(f.registry.get("preview_a")?.sourceVersion).toBe(8);
  });

  it("blocks immutable lease and a mismatched actor without reaching callbacks", async () => {
    const f=fixture({mode:"immutable"});
    await expect(f.update()).rejects.toThrow("Preview not found.");
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
    const d=fixture();
    await expect(d.update(old,next,{actorKey:"other"})).rejects.toThrow("Forbidden.");
    expect(d.authorize).not.toHaveBeenCalled();
    expect(d.apply).not.toHaveBeenCalled();
  });

  it("never mutates workspace on dependency or protected configuration changes", async () => {
    const f=fixture();
    const dependency={...next,files:next.files.map(x=>x.path==="package.json"
      ? {...x,content:'{"new":true}'}:x)};
    expect(await f.update(old,dependency)).toMatchObject({action:"restart_required"});
    const configuration=request(8,"next",[{path:"vite.config.ts",content:"export default {}"}]);
    expect(await f.update(old,configuration)).toMatchObject({action:"restart_required"});
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.registry.get("preview_a")?.sourceVersion).toBe(7);
  });

  it("refuses authority failure and dead workspace before the first write", async () => {
    const f=fixture();
    f.authorize.mockRejectedValueOnce(new Error("No DB source authorization."));
    await expect(f.update()).rejects.toMatchObject({category:"pre_write_authority",stage:"pre_write_authority"});
    f.healthy.mockResolvedValueOnce(false);
    await expect(f.update()).rejects.toThrow("Preview not found.");
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.registry.get("preview_a")?.basePath).toBe(basePath);
  });

  it("serializes different revisions, committing only in order", async () => {
    const f=fixture();
    const hold=gate();
    let active=0, highest=0;
    const first=vi.fn(async () => { active++;highest=Math.max(highest,active);await hold.promise;active--; });
    const second=vi.fn(async () => {active++;highest=Math.max(highest,active);active--;});
    const p1=f.update(old,next,{applyApprovedSource:first});
    // Enter the first writer while second enqueues.
    await vi.waitFor(()=>expect(first).toHaveBeenCalledOnce());
    const secondNext=request(9,"newest");
    const p2=f.update(next,secondNext,{applyApprovedSource:second});
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    hold.release();
    expect((await p1).sourceVersion).toBe(8);
    expect((await p2).sourceVersion).toBe(9);
    expect(highest).toBe(1);
    expect(f.registry.get("preview_a")?.sourceVersion).toBe(9);
  });

  it("rejects a concurrent stale revision instead of applying it twice", async () => {
    const f=fixture(); const hold=gate();
    const first=vi.fn(async()=>{await hold.promise;});
    const second=vi.fn(async()=>undefined);
    const p1=f.update(old,next,{applyApprovedSource:first});
    await vi.waitFor(()=>expect(first).toHaveBeenCalledOnce());
    const p2=f.update(old,next,{applyApprovedSource:second});
    hold.release();
    await expect(p1).resolves.toMatchObject({action:"updated"});
    await expect(p2).rejects.toThrow("Preview source is stale.");
    expect(second).not.toHaveBeenCalled();
  });

  it("quarantines a changed workspace when the DB source is superseded before commit", async () => {
    const f=fixture();
    f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      new Error("Newer saved source exists."));
    await expect(f.update()).rejects.toThrow("Development preview update failed.");
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.registry.count()).toBe(0);
    expect(f.close).toHaveBeenCalledOnce();
  });

  it("quarantines partial write failures and keeps capacity when close fails", async () => {
    const f=fixture({close:async()=>{throw new Error("Docker unavailable");}});
    await expect(f.update(old,next,{applyApprovedSource:async()=>{
      throw new Error("secret workspace error");
    }})).rejects.toThrow("Development preview update failed.");
    expect(f.registry.get("preview_a")?.basePath).toBe("/quarantined/preview_a/");
    expect(f.registry.count()).toBe(1);
    expect(f.registry.snapshot().quarantined).toBe(1);
    expect(f.close).toHaveBeenCalledOnce();
    await expect(f.update()).rejects.toThrow("Preview not found.");
  });

  it("does not delete a container until an active write settles, and close wins commit", async () => {
    const f=fixture();const hold=gate();
    const writer=vi.fn(async()=>{await hold.promise;});
    const write=f.update(old,next,{applyApprovedSource:writer});
    await vi.waitFor(()=>expect(writer).toHaveBeenCalledOnce());
    const cleanup=f.registry.close("preview_a");
    await Promise.resolve();
    expect(f.close).not.toHaveBeenCalled();
    hold.release();
    await expect(write).rejects.toThrow("Development preview update failed.");
    await expect(cleanup).resolves.toBe(true);
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.registry.get("preview_a")).toBeNull();
  });

  it("does not leak a stale update slot after successful work or rejection", async () => {
    const f=fixture();
    expect(f.registry.developmentUpdatePending("preview_a")).toBe(false);
    await f.update();
    expect(f.registry.developmentUpdatePending("preview_a")).toBe(false);
    await expect(f.update()).rejects.toThrow("Preview source is stale.");
    expect(f.registry.developmentUpdatePending("preview_a")).toBe(false);
  });
});


describe("H10Q2 bounded update stage evidence", () => {
  it("records only stages actually reached on success", async () => {
    const f=fixture(); await f.update();
    const d=f.observability.snapshot().durations;
    for(const stage of ["queue_wait","owner_check","pre_write_authority","source_resolve",
      "admission","workspace_verify","workspace_write","post_write_authority","lease_commit","snapshot_publish","total"])
      expect(d[`development_update.${stage}.ok`]).toMatchObject({count:1});
    expect(d["development_update.cleanup.ok"]).toBeUndefined();
  });
  it("classifies pre-write authority failure without mutating or leaking the error", async () => {
    const f=fixture(); f.authorize.mockRejectedValueOnce(new Error("secret authority detail"));
    await expect(f.update()).rejects.toMatchObject({category:"pre_write_authority",stage:"pre_write_authority",message:"Saved-source authority rejected the request."});
    expect(f.apply).not.toHaveBeenCalled(); expect(f.registry.get("preview_a")?.sourceVersion).toBe(7);
    const d=f.observability.snapshot().durations;
    expect(d["development_update.pre_write_authority.error"].count).toBe(1);
    expect(d["development_update.total.error"].count).toBe(1);
    expect(d["development_update.workspace_write.ok"]).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain("secret authority detail");
  });
  it("distinguishes post-write authority failure and unsuccessful cleanup", async () => {
    const f=fixture({close:async()=>{throw new Error("secret cleanup detail");}});
    f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("secret DB detail"));
    await expect(f.update()).rejects.toMatchObject({category:"quarantined",stage:"post_write_authority"});
    expect(f.registry.snapshot().quarantined).toBe(1);
    const d=f.observability.snapshot().durations;
    expect(d["development_update.workspace_write.ok"].count).toBe(1);
    expect(d["development_update.post_write_authority.error"].count).toBe(1);
    expect(d["development_update.cleanup.error"].count).toBe(1);
    expect(d["development_update.lease_commit.ok"]).toBeUndefined();
    expect(JSON.stringify(d)).not.toMatch(/secret|preview_a/);
  });
  it("distinguishes source publication failure after CAS and quarantines",async()=>{
    const f=fixture();
    await expect(f.update(old,next,{afterCommittedLease:async()=>{throw Error("publication failed");}}))
      .rejects.toMatchObject({category:"quarantined",stage:"snapshot_publish"});
    const d=f.observability.snapshot().durations;
    expect(d["development_update.lease_commit.ok"].count).toBe(1);
    expect(d["development_update.snapshot_publish.error"].count).toBe(1);
    expect(f.registry.get("preview_a")).toBeNull();
  });
});
