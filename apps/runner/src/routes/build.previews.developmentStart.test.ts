import { describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { makeTanstackDevelopmentStartRoute } from "./build.previews.developmentStart.js";
import type { startAdmittedTanstackDevelopmentPreview } from
  "../services/build/tanstackPreviewSharedLifecycle.js";

type DevelopmentStartInput = Parameters<typeof startAdmittedTanstackDevelopmentPreview>[0];

const actorKey = `u:${"a".repeat(64)}`;
const request = {protocolVersion:1 as const,operation:"production-build" as const,
  buildProjectId:"build-proj",sourceVersion:8,
  stackId:"tanstack-start-v1" as const, templateId:"tanstack-start-v1" as const,
  files: [{path:"package.json",content:"{}"}]};
const identity = {sourceFingerprint:"source",dependencyFingerprint:"deps",
  fingerprint:"fp",runtimeImageId:`sha256:${"a".repeat(64)}`};
const preview = {previewId:"preview_12345678-1234-4123-8123-123456789abc",
  buildProjectId:"build-proj",sourceVersion:8,basePath:"/isolated/",port:5173 as const};
function setup(overrides: Record<string, unknown> = {}) {
  const check = vi.fn();
  const authority = vi.fn(async () => undefined);
  const resolve = vi.fn(async () => identity);
  const start = vi.fn(async (input: DevelopmentStartInput) => {
      await input.authorize(input.ownerKey,input.request); // before launch
      await input.authorize(input.ownerKey,input.request); // after readiness
      return preview;
  });
  const deps = {enabled:()=>true,startupEnabled:()=>{},actorKey:()=>actorKey,
    parse:()=>request,verifySignedLock:check,assertSavedSource:authority,
    resolveIdentity:resolve,start,...overrides};
  const handler = makeTanstackDevelopmentStartRoute(deps);
  async function call(requestId?:string) {
    const req = {body:request,header:(name:string)=>
      name.toLowerCase()==="x-request-id" ? requestId : undefined} as unknown as Request;
    let status = 200; let payload:unknown;
    const res = {status:(s:number)=>{status=s;return res;},
      json:(v:unknown)=>{payload=v;return res;}} as unknown as Response;
    await handler(req,res,vi.fn() as NextFunction);
    return {status,payload};
  }
  return {call,check,authority,resolve,start};
}

describe("Phase 4D private development lease startup gate",()=>{
  it("is off by default, including when general startup is disabled",async()=>{
    const a=setup({enabled:()=>false});
    expect(await a.call()).toEqual({status:404,payload:{ok:false,code:"NOT_FOUND"}});
    const b=setup({startupEnabled:()=>{throw Error("disabled")}});
    expect((await b.call()).status).toBe(404);
    expect(a.start).not.toHaveBeenCalled();
    expect(b.start).not.toHaveBeenCalled();
  });
  it("rejects noncanonical actor, stack, revision before network or Docker",async()=>{
    for(const overrides of [
      {actorKey:()=>"browser-chosen-owner"},
      {parse:()=>({...request,stackId:"vite-react"})},
      {parse:()=>({...request,sourceVersion:8.5})},
    ]) {
      const h=setup(overrides);
      expect((await h.call()).status).toBe(400);
      expect(h.authority).not.toHaveBeenCalled();
      expect(h.resolve).not.toHaveBeenCalled();
      expect(h.start).not.toHaveBeenCalled();
    }
  });
  it("rejects malformed request correlation before authorization",async()=>{
    const h=setup();
    expect((await h.call("not-a-request-id")).status).toBe(400);
    expect(h.authority).not.toHaveBeenCalled();
    expect(h.start).not.toHaveBeenCalled();
  });
  it("checks saved DB source before Docker and after readiness",async()=>{
    const h=setup();
    expect(await h.call()).toEqual({status:200,payload:{ok:true,preview}});
    expect(h.check).toHaveBeenCalledTimes(3);
    expect(h.authority).toHaveBeenCalledTimes(3);
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.authority).toHaveBeenCalledWith(actorKey,request);
    expect(h.start.mock.calls[0]?.[0]).toMatchObject({ownerKey:actorKey,request,identity});
  });
  it("fails closed when saved source is wrong or the authority is down",async()=>{
    const h=setup({assertSavedSource:async()=>{throw Error("missing");}});
    expect(await h.call()).toEqual({status:503,payload:{ok:false,code:"DEVELOPMENT_START_UNAVAILABLE"}});
    expect(h.start).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });
  it("does not reveal source, dependency or Docker errors",async()=>{
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>undefined);
    try {
      const h=setup({start:async()=>{throw Error("/var/private/secrets");}});
      const result=await h.call("6a1e63d6-a7ce-44e7-bb69-4fcb3f7a681f");
      expect(result).toEqual({status:503,payload:{ok:false,code:"DEVELOPMENT_START_UNAVAILABLE"}});
      expect(warning).toHaveBeenCalledWith("RUNNER development preview start failed",{
        requestCorrelation:"6a1e63d6-a7ce-44e7-bb69-4fcb3f7a681f",
        stage:"lease_admission",category:"lease_or_reattachment",status:503,
      });
      expect(JSON.stringify(warning.mock.calls)).not.toContain("/var/private/secrets");
    } finally { warning.mockRestore(); }
  });
  it.each([
    ["capacity","capacity_rejected"],
    ["driver_validation","driver_validation_failed"],
    ["recovery_journal","recovery_journal_failed"],
    ["workspace","workspace_failed"],
    ["dependencies","dependencies_failed"],
    ["container","container_failed"],
    ["readiness","readiness_failed"],
  ] as const)("classifies sanitized %s failures precisely",async(stage,category)=>{
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>undefined);
    try {
      const h=setup({start:async(input:DevelopmentStartInput)=>{
        input.onPhase?.(stage);
        throw Error("private failure detail");
      }});
      expect((await h.call("6a1e63d6-a7ce-44e7-bb69-4fcb3f7a681f")).status).toBe(503);
      expect(warning).toHaveBeenCalledWith("RUNNER development preview start failed",{
        requestCorrelation:"6a1e63d6-a7ce-44e7-bb69-4fcb3f7a681f",
        stage,category,status:503,
      });
      expect(JSON.stringify(warning.mock.calls)).not.toContain("private failure detail");
    } finally { warning.mockRestore(); }
  });
});
