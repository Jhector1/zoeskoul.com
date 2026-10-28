import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FilePreviewOperationJournal, PreviewOperationRegistry } from "./reactPreviewOperations.js";

type Request = {buildProjectId: string; sourceVersion: number; fingerprint: string};
const request = (sourceVersion = 1):Request => ({buildProjectId:"project",sourceVersion,fingerprint:"lock-a"});
const ready = (sourceVersion:number) => ({previewId:"preview_00000000-0000-4000-8000-000000000001",
  buildProjectId:"project",sourceVersion,basePath:"/capability/",port:5173 as const});
let paths: string[] = [];
let registries: PreviewOperationRegistry<Request>[] = [];
async function setup(worker: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[1],
  cancel: ConstructorParameters<typeof PreviewOperationRegistry<Request>>[2] = async () => undefined) {
  const dir=await mkdtemp(path.join(os.tmpdir(),"zoebuild-k20d-"));
  paths.push(dir);
  const journal = new FilePreviewOperationJournal(dir);
  const registry = new PreviewOperationRegistry<Request>(journal,worker,cancel,x=>x);
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
    expect((await registry.start("actor-a",request())).operationId).toBe(start.operationId);
    expect((await registry.status(start.operationId,"actor-a","project"))?.state).toBe("preparing");
    expect(await registry.status(start.operationId,"actor-b","project")).toBeNull();
    expect(await registry.status(start.operationId,"actor-a","wrong-project")).toBeNull();
    release();
    await waitFor(async()=> (await registry.status(start.operationId,"actor-a","project"))?.state==="ready");
    expect(calls).toBe(1);
    const item=await registry.status(start.operationId,"actor-a","project");
    expect(item?.preview?.sourceVersion).toBe(1);
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
  it("does not reissue an expired ready result as a new browser session",async()=>{
    let starts=0;
    const {registry}=await setup(async ({request})=>{starts++;return ready(request.sourceVersion);});
    const first=await registry.start("actor-a",request());
    await waitFor(async()=>(await registry.status(first.operationId,"actor-a","project"))?.state==="ready");
    const second=await registry.start("actor-a",request());
    expect(second.operationId).not.toBe(first.operationId);
    await waitFor(async()=>(await registry.status(second.operationId,"actor-a","project"))?.state==="ready");
    expect(starts).toBe(2);
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
