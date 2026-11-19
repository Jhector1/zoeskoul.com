import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { makeTanstackDevelopmentUpdateRoute } from "./build.previews.developmentUpdate.js";
import { DevelopmentPreviewUpdateFailure } from "../services/build/tanstackDevelopmentPreviewUpdate.js";

const previewId = "preview_12345678-1234-4123-8123-123456789abc";
const actorKey = `u:${"a".repeat(64)}`;
const next = {
  protocolVersion: 1 as const,
  operation: "production-build" as const,
  buildProjectId: "project-1", sourceVersion: 8,
  stackId: "tanstack-start-v1" as const,
  templateId: "tanstack-start-v1" as const,
  files: [{path: "package.json", content: "{}"}],
};

function setup(overrides: Record<string, unknown> = {}) {
  const signed = vi.fn();
  const saved = vi.fn(async () => {});
  const commit = vi.fn(async (input: {
    actorKey: string;
    next: ProductionBuildJobRequestV1;
    authorizeCurrentSavedSource: (actorKey: string, next: ProductionBuildJobRequestV1) => Promise<void>;
  }) => {
    await input.authorizeCurrentSavedSource(input.actorKey, input.next);
    await input.authorizeCurrentSavedSource(input.actorKey, input.next);
    return {action:"updated" as const, sourceVersion:8,reason:"source edit", changedPaths:["src/main.tsx"]};
  });
  const deps = {
    enabled: () => true,
    actorKey: () => actorKey,
    parse: () => next,
    readLease: () => ({mode: "development" as const, ownerKey: actorKey,
      buildProjectId: "project-1", sourceVersion: 7, basePath:"/preview/"}),
    verifySignedLock: signed,
    assertSavedSource: saved,
    commit,
    ...overrides,
  };
  const handler = makeTanstackDevelopmentUpdateRoute(deps);
  async function call(params: {body?:unknown; id?:string} = {}) {
    const req = {params:{previewId:params.id ?? previewId}, body:params.body ?? next} as unknown as Request;
    let code = 200;
    let payload: unknown;
    const res = {
      status: (value: number) => {code = value; return res;},
      json: (value: unknown) => {payload = value; return res;},
    } as unknown as Response;
    await handler(req,res,vi.fn() as NextFunction);
    return {code,payload};
  }
  return {call,commit,signed,saved};
}

describe("Phase 4C disabled-by-default development update HTTP boundary", () => {
  it("returns not found without touching any source authority when disabled", async () => {
    const h = setup({enabled: () => false});
    expect(await h.call()).toEqual({code:404,payload:{ok:false,code:"NOT_FOUND"}});
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.saved).not.toHaveBeenCalled();
  });
  it("never updates immutable or cross-tenant and cross-project leases", async () => {
    const leases = [
      {mode:"immutable",ownerKey:actorKey,buildProjectId:"project-1",sourceVersion:7,basePath:"/p/"},
      {mode:"development",ownerKey:`u:${"b".repeat(64)}`,buildProjectId:"project-1",sourceVersion:7,basePath:"/p/"},
      {mode:"development",ownerKey:actorKey,buildProjectId:"project-2",sourceVersion:7,basePath:"/p/"},
      {mode:"development",ownerKey:actorKey,buildProjectId:"project-1",sourceVersion:7,basePath:"/quarantined/x/"},
      null,
    ];
    for (const lease of leases) {
      const h = setup({readLease: () => lease});
      expect((await h.call()).code).toBe(404);
      expect(h.commit).not.toHaveBeenCalled();
    }
  });
  it("rejects stale versions, bad actor identities and malformed preview IDs", async () => {
    const stale = setup({parse: () => ({...next,sourceVersion:7})});
    expect((await stale.call()).code).toBe(409);
    expect(stale.commit).not.toHaveBeenCalled();
    const invalidActor = setup({actorKey: () => "fake"});
    expect((await invalidActor.call()).code).toBe(400);
    expect(invalidActor.commit).not.toHaveBeenCalled();
    const wrongId = setup();
    expect((await wrongId.call({id:"../../other"})).code).toBe(404);
    expect(wrongId.commit).not.toHaveBeenCalled();
  });
  it("passes mandatory pre/post DB authority callback into canonical transaction", async () => {
    const h = setup();
    expect(await h.call()).toEqual({code:200,payload:{ok:true,action:"updated",sourceVersion:8}});
    expect(h.commit).toHaveBeenCalledOnce();
    expect(h.saved).toHaveBeenCalledTimes(2);
    expect(h.saved).toHaveBeenNthCalledWith(1,actorKey,next);
    expect(h.saved).toHaveBeenNthCalledWith(2,actorKey,next);
    expect(h.signed).toHaveBeenCalledTimes(3);
  });
  it("fails closed when signed dependency approval or saved-source authority rejects", async () => {
    const badApproval = setup({verifySignedLock: () => {throw new Error("unapproved");}});
    expect((await badApproval.call()).code).toBe(503);
    expect(badApproval.commit).not.toHaveBeenCalled();
    const outage = setup({assertSavedSource: async () => {throw new Error("unavailable");}});
    expect((await outage.call()).code).toBe(503);
    expect(outage.commit).toHaveBeenCalledOnce();
  });
  it("does not return changed source paths for a restart-required transition", async () => {
    const h = setup({commit: async () => ({action:"restart_required",sourceVersion:7,
      reason:"dependency changed",changedPaths:["secret/path"]})});
    expect(await h.call()).toEqual({code:409,payload:{ok:false,code:"RESTART_REQUIRED",sourceVersion:7}});
  });
});


describe("H10Q2 private typed update failure response",()=>{
  it("classifies only trusted typed failures, without returning details",async()=>{
    const pre=setup({commit:async()=>{throw new DevelopmentPreviewUpdateFailure("pre_write_authority","pre_write_authority");}});
    expect(await pre.call()).toEqual({code:503,payload:{ok:false,code:"UPDATE_PRE_WRITE_AUTHORITY_FAILED"}});
    const post=setup({commit:async()=>{throw new DevelopmentPreviewUpdateFailure("quarantined","post_write_authority");}});
    expect(await post.call()).toEqual({code:503,payload:{ok:false,code:"UPDATE_QUARANTINED"}});
    const unknown=setup({commit:async()=>{throw Error("UPDATE_QUARANTINED secret");}});
    expect(await unknown.call()).toEqual({code:503,payload:{ok:false,code:"UPDATE_UNAVAILABLE"}});
  });
});
