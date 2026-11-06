import { describe, expect, it } from "vitest";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";

const identity={sourceFingerprint:"source",dependencyFingerprint:"dependencies",
  runtimeImageId:`sha256:${"a".repeat(64)}`,fingerprint:"identity"} as const;

function lease(id:string, ownerKey:string, buildProjectId:string, close:()=>Promise<void>, at=10) {
  return {id,ownerKey,buildProjectId,sourceVersion:1,identity,containerId:`container-${id}`,
    basePath:`/api/build/projects/${buildProjectId}/preview/${id}/content/${"a".repeat(32)}/`,
    createdAt:at,lastActivityAt:at,close};
}
describe("shared ZoeBuild preview leases",()=>{
  it("counts all runtimes' live resources and owner scope",()=>{
    const registry=new SharedFullStackPreviewRegistry();
    registry.register(lease("one","owner-a","project-a",async()=>{}));
    registry.register(lease("two","owner-b","project-b",async()=>{}));
    expect(registry.count()).toBe(2);
    expect(registry.snapshot()).toEqual({active:2,closing:0,quarantined:0,totalReserved:2});
    expect(registry.countForOwner("owner-a")).toBe(1);
    expect(registry.countForOwner("owner-c")).toBe(0);
    expect(()=>registry.register(lease("one","owner-a","project-a",async()=>{}))).toThrow();
  });
  it("coalesces concurrent teardown and retains capacity until it finishes",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    let calls=0;
    let complete!:()=>void;
    registry.register(lease("one","owner-a","project-a",async()=>{
      calls++;
      await new Promise<void>(resolve=>{complete=resolve;});
    }));
    const first=registry.close("one");
    const second=registry.close("one");
    expect(registry.count()).toBe(1);
    expect(registry.snapshot()).toMatchObject({active:1,closing:1});
    expect(calls).toBe(1);
    complete();
    await Promise.all([first,second]);
    expect(registry.count()).toBe(0);
  });
  it("fails closed on teardown failure and retries rather than losing reservation",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    let calls=0;
    registry.register(lease("one","owner-a","project-a",async()=>{
      if (++calls === 1) throw Error("Docker temporarily unavailable");
    }));
    await expect(registry.close("one")).rejects.toThrow("Docker");
    expect(registry.count()).toBe(1);
    await registry.close("one");
    expect(registry.count()).toBe(0);
  });
  it("drains just one owner/project and expires idle or old leases",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    const stopped:string[]=[];
    for(const id of ["a","b","c"]){
      registry.register(lease(id,id==="c"?"other":"owner",id==="b"?"different":"project",async()=>{stopped.push(id)}));
    }
    expect(await registry.drain("owner","project")).toBe(1);
    expect(stopped).toEqual(["a"]);
    expect(registry.count()).toBe(2);
    await registry.sweep(200,50,100);
    expect(registry.count()).toBe(0);
  });
  it("lets cleanup win a concurrent health check and never crosses identity",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    let finishHealth!:()=>void;
    let finishClose!:()=>void;
    registry.register(lease("one","owner-a","project-a",async()=>{
      await new Promise<void>(resolve=>{finishClose=resolve;});
    },Date.now()));
    const claim=registry.claimReusable({ownerKey:"owner-a",buildProjectId:"project-a",
      sourceVersion:1,identity,healthCheck:async()=>{
        await new Promise<void>(resolve=>{finishHealth=resolve;});
        return true;
      },maxLifetimeMs:60_000});
    await Promise.resolve();
    const closing=registry.close("one");
    finishHealth();
    await expect(claim).resolves.toBeNull();
    finishClose();
    await closing;

    registry.register(lease("two","owner-a","project-a",async()=>{},Date.now()));
    await expect(registry.claimReusable({ownerKey:"owner-b",buildProjectId:"project-a",
      sourceVersion:1,identity,healthCheck:async()=>true,maxLifetimeMs:60_000})).resolves.toBeNull();
    await expect(registry.claimReusable({ownerKey:"owner-a",buildProjectId:"project-a",
      sourceVersion:1,identity:{...identity,dependencyFingerprint:"different"},
      healthCheck:async()=>true,maxLifetimeMs:60_000})).resolves.toBeNull();
  });
});
