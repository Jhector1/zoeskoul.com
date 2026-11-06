import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FilePreviewOperationJournal, PreviewOperationRegistry } from "./previewOperationJournal.js";

type Request = {buildProjectId: string; sourceVersion: number; fingerprint: string};
const request = (sourceVersion = 1):Request => ({buildProjectId:"project",sourceVersion,fingerprint:"lock-a"});
const ready = (sourceVersion:number) => ({previewId:"preview_00000000-0000-4000-8000-000000000001",
  buildProjectId:"project",sourceVersion,basePath:"/capability/",port:5173 as const});
let paths: string[] = [];
let registries: PreviewOperationRegistry<Request>[] = [];
async function setup(worker: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[1],
  cancel: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[2] = async () => undefined,
  reuse?: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[6],
  verify?: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[7]) {
  const dir=await mkdtemp(path.join(os.tmpdir(),"zoebuild-k20d-"));
  paths.push(dir);
  const journal = new FilePreviewOperationJournal(dir);
  const registry = new PreviewOperationRegistry<Request>(journal,worker,cancel,x=>x,
    undefined,undefined,reuse,verify);
  registries.push(registry);
  return {dir,journal,registry};
}
async function waitFor(predicate:()=>Promise<boolean>) {
  for(let i=0;i<80;i++) {if (await predicate()) return;await new Promise(r=>setTimeout(r,5));}
  throw new Error("test did not reach expected status");
}
afterEach(async()=>{
  // HTTP acknowledgement does not await the worker's final journal write.
  // Drain before removing temp directories to avoid ENOENT/EINVAL test races.
  await Promise.all(registries.map(registry=>registry.whenSettled()));
  await Promise.all(paths.map(p=>rm(p,{recursive:true,force:true})));
  paths=[];registries=[];
});

describe("K20D server-owned operation registry",()=>{
  it("acknowledges immediately, coalesces concurrent starts, and reports real phase/result",async()=>{
    let release!:()=>void;
    const hold = new Promise<void>(resolve=>{release=resolve;});
    let calls=0;
    const {registry,dir}=await setup(async ({request,onPhase})=>{
      calls++;onPhase("dependencies");await hold;
      onPhase("readiness");return ready(request.sourceVersion);
    });
    const start=await registry.start("actor-a",request());
    expect(start.state).toBe("preparing");
    expect(start.timing).toMatchObject({startKind:"cold",reuseCandidate:false,
      stages:{operation_admission:{outcome:"ok"},queue_wait:{outcome:"pending"}}});
    expect((await registry.start("actor-a",request())).operationId).toBe(start.operationId);
    expect((await registry.status(start.operationId,"actor-a","project"))?.state).toBe("preparing");
    expect(await registry.status(start.operationId,"actor-b","project")).toBeNull();
    expect(await registry.status(start.operationId,"actor-a","wrong-project")).toBeNull();
    release();
    await waitFor(async()=> (await registry.status(start.operationId,"actor-a","project"))?.state==="ready");
    expect(calls).toBe(1);
    const item=await registry.status(start.operationId,"actor-a","project");
    expect(item?.preview?.sourceVersion).toBe(1);
    expect(item?.timing.stages.operation_total.outcome).toBe("ok");
    expect(item?.timing.stages.workspace_create).toEqual({
      outcome:"unavailable",reason:"prior_stage_failed",
    });
    const disk=await readFile(path.join(dir,`${start.operationId}.json`),"utf8");
    expect(disk).not.toContain("actor-a");
    expect(disk).not.toContain("/capability/");
    expect(disk).not.toContain("lock-a");
    expect(disk).not.toContain("preview_0000");
  });
  it("never invents a ready preview after runner restart",async()=>{
    const {registry,journal}=await setup(async ({request})=>ready(request.sourceVersion));
    const op=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(op.operationId,"actor-a","project"))?.state==="ready");
    await registry.whenSettled();
    const restarted=new PreviewOperationRegistry<Request>(journal,async()=>ready(1),async()=>{},x=>x);
    expect(await restarted.status(op.operationId,"actor-a","project")).toMatchObject({
      state:"failed",code:"PREVIEW_RUNNER_RESTARTED"
    });
    expect(await restarted.status(op.operationId,"actor-b","project")).toBeNull();
  });
  it("cancels an old operation when a newer saved source is selected",async()=>{
    const stopped:string[]=[];
    const {registry}=await setup(async ({request,signal})=>{
      if (request.sourceVersion===1) {
        await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));
        throw new Error("Preview start cancelled.");
      }
      return ready(2);
    }, async(_actor,preview)=>{stopped.push(preview);});
    const old=await registry.start("actor-a",request(1));
    const latest=await registry.start("actor-a",request(2));
    await waitFor(async()=>(await registry.status(old.operationId,"actor-a","project"))?.state==="cancelled");
    await waitFor(async()=>(await registry.status(latest.operationId,"actor-a","project"))?.state==="ready");
    await expect(registry.start("actor-a",request(1))).rejects.toThrow("Preview source is stale.");
    expect(stopped).toEqual([]);
  });
  it("warm reopen returns the same healthy lease without another worker start",async()=>{
    let starts=0;
    let healthChecks=0;
    const {registry}=await setup(async ({request})=>{starts++;return ready(request.sourceVersion);},
      async()=>undefined,async ({preview})=>{healthChecks++;return preview;});
    const first=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(first.operationId,"actor-a","project"))?.state==="ready");
    const second=await registry.start("actor-a",request());
    expect(second.operationId).not.toBe(first.operationId);
    expect(second.preview?.previewId).toBe(first.preview?.previewId ?? ready(1).previewId);
    expect(second.timing).toMatchObject({startKind:"reuse",reuseCandidate:true,
      stages:{operation_total:{outcome:"ok"}}});
    expect(starts).toBe(1);
    expect(healthChecks).toBe(1);
  });
  it("coalesces simultaneous ready reopens into one health check and one warm operation",async()=>{
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    let starts=0;
    let healthChecks=0;
    const {registry}=await setup(async ({request})=>{starts++;return ready(request.sourceVersion);},
      async()=>undefined,async ({preview})=>{healthChecks++;await hold;return preview;});
    const cold=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(cold.operationId,"actor-a","project"))?.state==="ready");
    const first=registry.start("actor-a",request());
    const second=registry.start("actor-a",request());
    release();
    const [a,b]=await Promise.all([first,second]);
    expect(a.operationId).toBe(b.operationId);
    expect(a.preview?.previewId).toBe(ready(1).previewId);
    expect({starts,healthChecks}).toEqual({starts:1,healthChecks:1});
  });
  it("replaces an unhealthy or differently fingerprinted lease",async()=>{
    let starts=0;
    let healthChecks=0;
    const {registry}=await setup(async ({request})=>{starts++;return ready(request.sourceVersion);},
      async()=>undefined,async ()=>{healthChecks++;return null;});
    const first=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(first.operationId,"actor-a","project"))?.state==="ready");
    const replacement=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(replacement.operationId,"actor-a","project"))?.state==="ready");
    const different=await registry.start("actor-a",{...request(),fingerprint:"lock-b"});
    await waitFor(async()=>(await registry.status(different.operationId,"actor-a","project"))?.state==="ready");
    expect({starts,healthChecks}).toEqual({starts:3,healthChecks:1});
  });
  it("authoritatively fails every operation record when its shared lease dies",async()=>{
    let healthy=true;
    const {registry}=await setup(async ({request})=>ready(request.sourceVersion),
      async()=>undefined,async ({preview})=>preview,async()=>healthy);
    const cold=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(cold.operationId,"actor-a","project"))?.state==="ready");
    const warm=await registry.start("actor-a",request());
    expect(warm.state).toBe("ready");
    healthy=false;
    expect(await registry.status(warm.operationId,"actor-a","project")).toMatchObject({
      state:"failed",code:"PREVIEW_LEASE_UNAVAILABLE",
    });
    expect(await registry.status(cold.operationId,"actor-a","project")).toMatchObject({
      state:"failed",code:"PREVIEW_LEASE_UNAVAILABLE",
    });
  });
  it("fences an old warm reopen when a newer source is admitted during health check",async()=>{
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    const {registry}=await setup(async ({request})=>ready(request.sourceVersion),
      async()=>undefined,async ({preview})=>{await hold;return preview;});
    const cold=await registry.start("actor-a",request(1));
    await waitFor(async()=>(await registry.status(cold.operationId,"actor-a","project"))?.state==="ready");
    const staleReopen=registry.start("actor-a",request(1));
    await Promise.resolve();
    const newest=await registry.start("actor-a",request(2));
    release();
    await expect(staleReopen).rejects.toThrow("stale");
    await waitFor(async()=>(await registry.status(newest.operationId,"actor-a","project"))?.state==="ready");
  });
  it("cancels a long-running startup without publishing a ready capability",async()=>{
    let release!:()=>void;
    const hold=new Promise<void>(r=>{release=r;});
    const stopped:string[]=[];
    const {registry}=await setup(async ({request})=>{await hold;return ready(request.sourceVersion);},
      async(_actor,previewId)=>{stopped.push(previewId);});
    const op=await registry.start("actor-a",request());
    expect(await registry.cancel(op.operationId,"actor-a","wrong-project")).toBe(false);
    expect(await registry.cancel(op.operationId,"actor-a","project")).toBe(true);
    release();
    await waitFor(async()=>stopped.length===1);
    const result=await registry.status(op.operationId,"actor-a","project");
    expect(result?.state).toBe("cancelled");
    expect(result?.preview).toBeUndefined();
  });
});
