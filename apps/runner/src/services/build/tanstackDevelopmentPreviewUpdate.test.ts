import { describe, expect, it, vi } from "vitest";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { coordinateTanstackDevelopmentPreviewUpdate } from "./tanstackDevelopmentPreviewUpdate.js";

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
  const close = vi.fn(opts.close ?? (async () => undefined));
  registry.register({id:"preview_a",mode:opts.mode ?? "development",ownerKey:"actor",
    buildProjectId:"p",sourceVersion:7,identity:createTanstackPreviewIdentity(old,image),
    containerId:"container",basePath,createdAt:Date.now(),lastActivityAt:Date.now(),close});
  const authorize = vi.fn(async () => undefined);
  const healthy = vi.fn(async () => true);
  const apply = vi.fn(async (_args: unknown) => undefined);
  const update = (previous = old, subsequent = next, overrides: Record<string,unknown> = {}) =>
    coordinateTanstackDevelopmentPreviewUpdate({
      registry,previewId:"preview_a",actorKey:"actor",previous,next:subsequent,
      authorizeCurrentSavedSource:authorize,verifyLiveWorkspace:healthy,
      applyApprovedSource:apply,...overrides,
    } as Parameters<typeof coordinateTanstackDevelopmentPreviewUpdate>[0]);
  return {registry,close,authorize,healthy,apply,update};
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
    await expect(f.update()).rejects.toThrow("No DB source authorization.");
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
