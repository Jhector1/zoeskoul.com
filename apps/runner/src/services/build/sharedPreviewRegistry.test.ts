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
  it("reports one explicit owner/project lifecycle state",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    expect(registry.stateForProject("owner","project")).toBe("idle");
    const finish=registry.beginProjectStart("owner","project");
    expect(registry.stateForProject("owner","project")).toBe("starting");
    expect(()=>registry.beginProjectStart("owner","project")).toThrow("transition");
    finish();
    registry.register({...lease("dev","owner","project",async()=>{},Date.now()),mode:"development"});
    expect(registry.stateForProject("owner","project")).toBe("ready");
    let release!:()=>void;
    const update=registry.withDevelopmentUpdate("dev",async()=>{
      await new Promise<void>(resolve=>{release=resolve;});
    });
    for(let i=0;i<10 && !release;i++)await Promise.resolve();
    expect(registry.stateForProject("owner","project")).toBe("updating");
    release();await update;
    await registry.close("dev");
    registry.register({...lease("fallback","owner","project",async()=>{},Date.now()),mode:"immutable"});
    expect(registry.stateForProject("owner","project")).toBe("controlled_fallback");
    await registry.close("fallback");
    registry.register({...lease("orphan","owner","project",async()=>{},Date.now()),
      mode:"development",basePath:"/quarantined/orphan/"});
    expect(registry.stateForProject("owner","project")).toBe("recovering");
  });
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
  it("waits for an active development update without treating it as unhealthy",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    registry.register({...lease("dev","owner","project",async()=>{},Date.now()),mode:"development"});
    let release!:()=>void;
    const update=registry.withDevelopmentUpdate("dev",async()=>
      new Promise<void>(resolve=>{release=resolve;}));
    for(let i=0;i<10 && !release;i++)await Promise.resolve();
    const settled=registry.waitForDevelopmentSettled("dev");
    let finished=false;void settled.then(()=>{finished=true;});
    await Promise.resolve();expect(finished).toBe(false);
    release();await update;
    expect((await settled)?.id).toBe("dev");
    expect(registry.stateForProject("owner","project")).toBe("ready");
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


describe("development lease isolation (not enabled by preview routes)",()=>{
  it("normalizes all existing callers to immutable and retains the mode on touch",()=>{
    const registry=new SharedFullStackPreviewRegistry();
    registry.register(lease("old","owner","project",async()=>{}));
    expect(registry.get("old")?.mode).toBe("immutable");
    registry.touch("old",Date.now());
    expect(registry.get("old")?.mode).toBe("immutable");
    expect(()=>registry.register({...lease("bad","owner","project",async()=>{}),
      mode:"other" as "immutable"})).toThrow("Invalid full-stack preview lease mode");
    expect(registry.count()).toBe(1);
  });
  it("never promotes a development lease through immutable reuse",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    let healthChecks=0;
    registry.register({...lease("dev","owner","project",async()=>{},Date.now()),
      mode:"development"});
    const reused=await registry.claimReusable({
      ownerKey:"owner",buildProjectId:"project",sourceVersion:1,identity,
      maxLifetimeMs:60_000,
      healthCheck:async()=>{healthChecks++;return true},
    });
    expect(reused).toBeNull();
    expect(healthChecks).toBe(0);
    expect(registry.snapshot().totalReserved).toBe(1);
    expect(await registry.drain("owner","project")).toBe(1);
    expect(registry.count()).toBe(0);
  });
  it("allows reuse of a matching immutable lease without claiming a development lease",async()=>{
    const registry=new SharedFullStackPreviewRegistry();
    registry.register({...lease("dev","owner","project",async()=>{},Date.now()),
      mode:"development"});
    registry.register(lease("immutable","owner","project",async()=>{},Date.now()));
    const reused=await registry.claimReusable({
      ownerKey:"owner",buildProjectId:"project",sourceVersion:1,identity,
      maxLifetimeMs:60_000,healthCheck:async()=>true,
    });
    expect(reused?.id).toBe("immutable");
    expect(reused?.mode).toBe("immutable");
    expect(registry.count()).toBe(2);
  });
});


describe("development preview reattachment identity and liveness",()=>{
  const maxLifetimeMs=60_000;
  function setup() {
    const registry=new SharedFullStackPreviewRegistry();
    const now=Date.now();
    registry.register({...lease("reattach","owner","project",async()=>{},now),
      mode:"development"});
    const input={ownerKey:"owner",buildProjectId:"project",sourceVersion:1,
      identity,maxLifetimeMs,healthCheck:async()=>true};
    return {registry,input};
  }
  it("reattaches the same live development lease without reserving a second slot",async()=>{
    const {registry,input}=setup();
    const first=await registry.claimDevelopmentReusable(input);
    const second=await registry.claimDevelopmentReusable(input);
    expect(first?.id).toBe("reattach");
    expect(second?.id).toBe("reattach");
    expect(registry.snapshot().totalReserved).toBe(1);
  });
  it("rejects cross-owner, project, revision, fingerprint and expired leases before health",async()=>{
    const {registry,input}=setup();
    let checks=0;
    const healthCheck=async()=>{checks++;return true};
    for(const override of [
      {ownerKey:"other"},{buildProjectId:"different"},
      {sourceVersion:2},{identity:{...identity,fingerprint:"not-current"}},
      {identity:{...identity,dependencyFingerprint:"not-current"}},
      {maxLifetimeMs:0},
    ]) {
      expect(await registry.claimDevelopmentReusable({...input,...override,
        healthCheck})).toBeNull();
    }
    expect(checks).toBe(0);
  });
  it("rejects a pending update or quarantined lease",async()=>{
    const {registry,input}=setup();
    let release!:()=>void;
    const pending=registry.withDevelopmentUpdate("reattach",async()=>{
      await new Promise<void>(resolve=>{release=resolve;});
    });
    for(let i=0;i<10 && !release;i++)await Promise.resolve();
    expect(release).toBeTypeOf("function");
    expect(await registry.claimDevelopmentReusable(input)).toBeNull();
    release();await pending;
    const active=registry.get("reattach")!;
    registry.register({...lease("quarantine","owner","project",async()=>{},Date.now()),
      mode:"development",basePath:"/quarantined/quarantine/"});
    expect(await registry.claimDevelopmentReusable({...input,
      sourceVersion:active.sourceVersion+1})).toBeNull();
  });
  it("never reattaches while cleanup wins a concurrent health check",async()=>{
    const {registry,input}=setup();
    let finishHealth!:()=>void;
    const claim=registry.claimDevelopmentReusable({...input,
      healthCheck:async()=>new Promise<boolean>(resolve=>{finishHealth=()=>resolve(true)})});
    await Promise.resolve();
    const closing=registry.close("reattach");
    finishHealth();
    expect(await claim).toBeNull();
    await closing;
  });
});
