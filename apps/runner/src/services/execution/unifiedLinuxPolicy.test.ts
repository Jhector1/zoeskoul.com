import {describe,it,expect} from "vitest";
import {linuxCapabilities,resolveUnifiedLinuxPolicy,type LinuxPolicy,type LinuxCapability} from "./unifiedLinuxPolicy.js";
import {environmentScopeKey,planUnifiedLinuxAdmission,persistentEnvironmentSpec,planPersistentEnvironmentLifecycle,type PersistentEnvironmentRecord,type PersistentEnvironmentEvidence,type EnvironmentRecord} from "./unifiedLinuxAdmission.js";
function policy(on: LinuxCapability[] = [], maxTerminals=3): LinuxPolicy {
  return {capabilities:Object.fromEntries(linuxCapabilities.map(k=>[k,on.includes(k)])) as LinuxPolicy["capabilities"],
    limits:{maxTerminals,memoryMiB:512,cpuMillicores:500,pids:64,diskMiB:1024,idleMinutes:30,lifetimeMinutes:120}};
}
function resolve(requested:unknown, override:Record<string,unknown>={}) {
  const p=policy([...linuxCapabilities]);
  return resolveUnifiedLinuxPolicy({platform:p,organization:p,course:p,entitlement:p,verifiedRuntime:p,requested,...override});
}
const scope={tenantId:"tenant-a",actorId:"student-a",workspaceId:"workspace-a"};
const base=policy();
const record:EnvironmentRecord={id:"env-1",scope,policy:base,state:"running",terminalCount:2};
describe("unified Linux policy",()=>{
  it("permits an offline ordinary profile",()=>expect(resolve(base)).toEqual({ok:true,policy:base}));
  for (const layer of ["platform","organization","course","entitlement","verifiedRuntime"]) {
    it(`requires administrator allowance from ${layer}`,()=>expect(resolve(policy(["administrator"]),{[layer]:base})).toEqual({ok:false,reason:"CAPABILITY_DENIED",capability:"administrator"}));
  }
  it("rejects missing runtime evidence",()=>expect(resolve(base,{verifiedRuntime:undefined}).ok).toBe(false));
  it("rejects unknown fields",()=>expect(resolve({...base,extra:true}).ok).toBe(false));
  it("rejects invalid quotas",()=>expect(resolve(policy([],0)).ok).toBe(false));
  it("intersects terminal limits",()=>expect(resolve(base,{course:policy([...linuxCapabilities],1)})).toEqual({ok:true,policy:policy([],1)}));
  it("rejects repository access without protected networking",()=>expect(resolve(policy(["repositoryAccess"]))).toEqual({ok:false,reason:"UNSAFE_COMBINATION"}));
  it("rejects unsafe root workspace sync",()=>expect(resolve(policy(["administrator","workspaceSync"])).ok).toBe(false));
  it("rejects unsafe root persistence",()=>expect(resolve(policy(["administrator","persistentStorage"])).ok).toBe(false));
  it("allows root sync only when explicitly verified",()=>expect(resolve(policy(["administrator","workspaceSync","rootSafeWorkspaceSync"])).ok).toBe(true));
  it("rejects unavailable systemd",()=>expect(resolve(policy(["systemd"]),{verifiedRuntime:base}).ok).toBe(false));
  it("rejects unavailable preview",()=>expect(resolve(policy(["webPreview"]),{verifiedRuntime:base}).ok).toBe(false));
});
describe("unified Linux admission",()=>{
  it("creates only when no record exists",()=>expect(planUnifiedLinuxAdmission(scope,base,[],"open")).toEqual({action:"create"}));
  it("resumes without creating a duplicate",()=>expect(planUnifiedLinuxAdmission(scope,base,[record],"open")).toEqual({action:"resume",environmentId:"env-1"}));
  it("adds a terminal to the same environment",()=>expect(planUnifiedLinuxAdmission(scope,base,[record],"add-terminal")).toEqual({action:"attach-terminal",environmentId:"env-1"}));
  it("does not evict when at terminal capacity",()=>expect(planUnifiedLinuxAdmission(scope,base,[{...record,terminalCount:3}],"add-terminal")).toEqual({action:"blocked",reason:"TERMINAL_LIMIT"}));
  it("resumes at capacity",()=>expect(planUnifiedLinuxAdmission(scope,base,[{...record,terminalCount:3}],"open").action).toBe("resume"));
  it("blocks profile change without destructive action",()=>expect(planUnifiedLinuxAdmission(scope,policy(["administrator"]),[record],"open")).toEqual({action:"blocked",reason:"POLICY_CHANGED"}));
  it("blocks duplicate registry state",()=>expect(planUnifiedLinuxAdmission(scope,base,[record,{...record,id:"env-2"}],"open")).toEqual({action:"blocked",reason:"INVALID_REGISTRY"}));
  it("rejects cross-tenant records",()=>expect(planUnifiedLinuxAdmission({...scope,tenantId:"tenant-b"},base,[record],"open")).toEqual({action:"blocked",reason:"UNAUTHORIZED_SCOPE"}));
  it("rejects cross-user records",()=>expect(planUnifiedLinuxAdmission({...scope,actorId:"student-b"},base,[record],"open").action).toBe("blocked"));
  it("rejects cross-workspace records",()=>expect(planUnifiedLinuxAdmission({...scope,workspaceId:"workspace-b"},base,[record],"open").action).toBe("blocked"));
  for(const state of ["creating","stopping","cleanup_pending","stopped"] as const) {
    it(`does not create while ${state}`,()=>expect(planUnifiedLinuxAdmission(scope,base,[{...record,state}],"open").action).toBe("blocked"));
  }
  it("scope keys cannot collide on separators",()=>expect(environmentScopeKey({...scope,tenantId:"a:b",actorId:"c"})===environmentScopeKey({...scope,tenantId:"a",actorId:"b:c"})).toBe(false));
});

// One durable environment; no file copies or workspace/home volume pair.
const durablePolicy=policy(["persistentStorage"]);
const durableRecord:PersistentEnvironmentRecord={scope,generation:"11111111-1111-4111-8111-111111111111",providerId:"learning-storage-dev",backend:"docker",policy:durablePolicy,state:"stopped",resourceId:"a".repeat(64)};
const durableSpec=persistentEnvironmentSpec(durableRecord);
const durableEvidence:PersistentEnvironmentEvidence={providerId:durableRecord.providerId,backend:"docker",scopeLeaseHeld:true,registryReadVerified:true,hardQuotaVerified:true,nonRootIsolationVerified:true,durableFilesystemVerified:true,observed:"stopped",observedSpec:durableSpec,observedResourceId:durableRecord.resourceId!,identityVerified:true};
const plan=planPersistentEnvironmentLifecycle;
const absent={...durableEvidence,observed:"scope_absent" as const,observedSpec:undefined,observedResourceId:undefined};
const running={...durableEvidence,observed:"running" as const};
describe("persistent environment lifecycle",()=>{
  it("derives a stable whole-environment name without raw user identifiers",()=>{
    expect(durableSpec.resourceName).toMatch(/^zoe-learn-p-[a-f0-9]{48}$/);
    expect(durableSpec.resourceName).not.toContain(scope.actorId);
    expect(persistentEnvironmentSpec({...durableRecord,state:"running"})).toEqual(durableSpec);
  });
  for(const k of ["tenantId","actorId","workspaceId"] as const)it(`isolates ${k}`,()=>expect(persistentEnvironmentSpec({...durableRecord,scope:{...scope,[k]:"other"}}).resourceName).not.toBe(durableSpec.resourceName));
  it("changes identity for a new generation",()=>expect(persistentEnvironmentSpec({...durableRecord,generation:"22222222-2222-4222-8222-222222222222"}).resourceName).not.toBe(durableSpec.resourceName));
  it("requires verified absence before reserving",()=>{
    expect(plan(scope,durablePolicy,[],absent,"open")).toEqual({action:"reserve"});
    expect(plan(scope,durablePolicy,[],durableEvidence,"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,new Array<PersistentEnvironmentRecord>(1),absent,"open").action).toBe("blocked");
  });
  it("reserves allocating before provisioning and never retries an ambiguous allocation",()=>{
    const r={...durableRecord,state:"reserved" as const,resourceId:null};
    const e={...durableEvidence,observed:"resource_absent" as const,observedResourceId:undefined};
    expect(plan(scope,durablePolicy,[r],e,"open")).toMatchObject({action:"provision",nextState:"allocating"});
    expect(plan(scope,durablePolicy,[{...r,state:"allocating"}],e,"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[{...r,state:"allocating"}],durableEvidence,"reconcile").action).toBe("blocked");
  });
  it("commits a verified newly allocated stopped environment",()=>expect(plan(scope,durablePolicy,[{...durableRecord,state:"allocating"}],durableEvidence,"reconcile")).toMatchObject({action:"commit",nextState:"stopped"}));
  it("starts the exact stopped resource, retaining its ID",()=>expect(plan(scope,durablePolicy,[durableRecord],durableEvidence,"open")).toMatchObject({action:"start",nextState:"starting",resourceId:durableRecord.resourceId}));
  it("commits start only after verified running state",()=>{
    const r={...durableRecord,state:"starting" as const};
    expect(plan(scope,durablePolicy,[r],running,"reconcile")).toMatchObject({action:"commit",nextState:"running"});
    expect(plan(scope,durablePolicy,[r],durableEvidence,"reconcile").action).toBe("blocked");
  });
  it("reuses the same running resource",()=>expect(plan(scope,durablePolicy,[{...durableRecord,state:"running"}],running,"open")).toMatchObject({action:"reuse",resourceId:durableRecord.resourceId}));
  it("records external stop, never replacement",()=>expect(plan(scope,durablePolicy,[{...durableRecord,state:"running"}],durableEvidence,"reconcile")).toMatchObject({action:"commit",nextState:"stopped"}));
  it("requires explicit stop authorization and independently verified idle state",()=>{
    const r={...durableRecord,state:"running" as const};
    expect(plan(scope,durablePolicy,[r],running,"stop").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[r],running,"idle-stop").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[r],{...running,explicitStopAuthorized:true},"stop")).toMatchObject({action:"stop",nextState:"stopping"});
    expect(plan(scope,durablePolicy,[r],{...running,idleStopVerified:true},"idle-stop")).toMatchObject({action:"stop",nextState:"stopping"});
  });
  it("commits stop only with actual stopped evidence",()=>{
    const r={...durableRecord,state:"stopping" as const};
    expect(plan(scope,durablePolicy,[r],running,"reconcile").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[r],durableEvidence,"reconcile")).toMatchObject({action:"commit",nextState:"stopped"});
  });
  it("allows verified authorized stop even after policy or quota is revoked",()=>expect(plan(scope,base,[{...durableRecord,state:"running"}],{...running,hardQuotaVerified:false,explicitStopAuthorized:true},"stop").action).toBe("stop"));
  it("does not delete on repeated stop",()=>expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,explicitStopAuthorized:true},"stop").action).toBe("already_stopped"));
  for(const observed of ["scope_absent","resource_absent","unknown","conflict"] as const)it(`never replaces existing data when ${observed}`,()=>expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,observed},"open").action).toBe("blocked"));
  for(const k of ["scopeLeaseHeld","registryReadVerified","hardQuotaVerified","nonRootIsolationVerified","durableFilesystemVerified","identityVerified"] as const)it(`requires ${k} for open`,()=>expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,[k]:false},"open").action).toBe("blocked"));
  it("refuses a substituted ID, spec, provider, backend or quota",()=>{
    expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,observedResourceId:"b".repeat(64)},"open").action).toBe("blocked");
    for(const k of Object.keys(durableSpec) as (keyof typeof durableSpec)[])expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,observedSpec:{...durableSpec,[k]:"wrong"}},"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,providerId:"other"},"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[durableRecord],{...durableEvidence,backend:"incus"},"open").action).toBe("blocked");
    expect(plan(scope,{...durablePolicy,limits:{...durablePolicy.limits,diskMiB:2048}},[durableRecord],durableEvidence,"open").action).toBe("blocked");
  });
  it("refuses foreign scope, duplicate rows and recovery-required",()=>{
    expect(plan({...scope,actorId:"foreign"},durablePolicy,[durableRecord],durableEvidence,"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[durableRecord,durableRecord],durableEvidence,"open").action).toBe("blocked");
    expect(plan(scope,durablePolicy,[{...durableRecord,state:"recovery_required"}],durableEvidence,"open").action).toBe("blocked");
  });
  it("does not permit root persistence or bypass policy denial",()=>{
    expect(plan(scope,base,[durableRecord],durableEvidence,"open").action).toBe("blocked");
    expect(plan(scope,policy(["administrator","persistentStorage","rootSafePersistence"]),[],absent,"open").action).toBe("blocked");
  });
  for(const backend of ["incus","microvm"] as const)it(`can describe ${backend} without enabling an adapter`,()=>{
    const r={...durableRecord,backend,resourceId:"immutable-provider-id"};
    expect(plan(scope,durablePolicy,[r],{...durableEvidence,backend,observedSpec:persistentEnvironmentSpec(r),observedResourceId:r.resourceId},"open").action).toBe("start");
  });
});
