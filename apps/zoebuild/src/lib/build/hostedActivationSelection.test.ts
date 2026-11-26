import assert from "node:assert/strict";
import {test,vi} from "vitest";
import type {PrismaClient} from "@zoeskoul/db";
vi.mock("server-only",()=>({}));
import {commitHostedSelection,observeOwnedHostedSelection,HostedSelectionError} from "./hostedActivationSelection";
import {HOSTED_RUNTIME_KIND,HOSTED_RUNTIME_PROVIDER,type HostedRuntimeEvidence} from "./hostedActivationEvidence";

const scope={ownerId:"owner-one",buildProjectId:"project-one"};
const activation={projectId:scope.buildProjectId,sourceVersion:7,artifactHash:"a".repeat(64),
  objectSha256:"b".repeat(64),activatedAt:"2026-11-25T17:40:00.123456+00:00"};
const runtime={state:"verified-active",activation} as const;
const deployment={id:"release-one",buildProjectId:scope.buildProjectId,sourceVersion:7,
  environment:"production",provider:HOSTED_RUNTIME_PROVIDER,kind:HOSTED_RUNTIME_KIND,
  status:"ready",artifactHash:activation.artifactHash,providerRef:activation.objectSha256};
type Row={generation:bigint;deploymentId:string|null;activationToken:string|null};
function fixture(initial:Row|null=null) {
  let row=initial;
  const f={eligible:true, currentDeployment:{...deployment}, conflict:"", loseCas:false, writes:0,
    isolation:[] as string[], get row(){return row;}};
  const tx={buildProject:{findFirst:async ({where}: {where:{id:string;codeProject:{ownerId:string}}})=>
    f.eligible && where.id===scope.buildProjectId && where.codeProject.ownerId===scope.ownerId ?
    {id:scope.buildProjectId,status:"ready",stackId:"tanstack-start-v1",codeProject:{archivedAt:null},
      hostedActivation:row && {...row,deployment:row.deploymentId?f.currentDeployment:null}} : null},
    buildDeployment:{findFirst:async()=>f.currentDeployment},
    buildHostedActivation:{create:async ({data}:{data:Row})=>{f.writes++;row={generation:data.generation,
      deploymentId:data.deploymentId,activationToken:data.activationToken};return row;},
      updateMany:async ({where,data}:{where:{generation:bigint};data:Row})=>{
        if(f.loseCas || row?.generation!==where.generation)return {count:0};f.writes++;row={...data};return {count:1};}}};
  const client={$transaction:async (fn:(v:typeof tx)=>unknown,options:{isolationLevel:string})=>{
    f.isolation.push(options.isolationLevel);if(f.conflict)throw {code:f.conflict};return fn(tx);}} as unknown as PrismaClient;
  return {client,f};
}
const select=(expectedGeneration:bigint, evidence:HostedRuntimeEvidence=runtime)=>({...scope,
  action:"select" as const,deploymentId:deployment.id,expectedGeneration,runtime:evidence});
const unpublish=(expectedGeneration:bigint)=>({...scope,action:"unpublish" as const,expectedGeneration});
const selected={generation:1n,deploymentId:deployment.id,activationToken:activation.activatedAt};
async function rejects(p:Promise<unknown>,code:string) {
  await assert.rejects(p,(e:unknown)=>e instanceof HostedSelectionError && e.code===code);
}
test("first selection persists exact token and starts generation at one",async()=>{
  const {client,f}=fixture();assert.deepEqual(await commitHostedSelection(client,select(0n)),selected);
  assert.deepEqual(f.row,selected);assert.deepEqual(f.isolation,["Serializable"]);
});
test("matching committed selection is observable, not inferred from latest ready",async()=>{
  const {client}=fixture(selected);const o=await observeOwnedHostedSelection(client,scope,runtime);
  assert.equal(o.generation,1n);assert.equal(o.evidence.state,"eligible");
});
test("missing selection never publishes a ready deployment",async()=>{
  const {client}=fixture();assert.deepEqual(await observeOwnedHostedSelection(client,scope,runtime),
    {generation:0n,evidence:{state:"denied",reason:"UNPUBLISHED"}});
});
test("unpublish retains tombstone and increases generation; stale retry cannot republish",async()=>{
  const {client,f}=fixture(selected);await commitHostedSelection(client,unpublish(1n));
  assert.deepEqual(f.row,{generation:2n,deploymentId:null,activationToken:null});
  await rejects(commitHostedSelection(client,select(1n)),"STALE_GENERATION");
  assert.equal((await observeOwnedHostedSelection(client,scope,runtime)).evidence.state,"denied");
  assert.equal((await commitHostedSelection(client,select(2n))).generation,3n);
});
test("first unpublish establishes durable generation",async()=>{
  const {client}=fixture();assert.deepEqual(await commitHostedSelection(client,unpublish(0n)),
    {generation:1n,deploymentId:null,activationToken:null});
});
test("wrong owner and archived or missing project cannot mutate",async()=>{
  const {client,f}=fixture();await rejects(commitHostedSelection(client,{...select(0n),ownerId:"owner-two"}),"PROJECT_INELIGIBLE");
  f.eligible=false;await rejects(commitHostedSelection(client,select(0n)),"PROJECT_INELIGIBLE");assert.equal(f.writes,0);
});
test("another project's deployment or invalid provider cannot be selected",async()=>{
  const {client,f}=fixture();f.currentDeployment.buildProjectId="project-two";
  await rejects(commitHostedSelection(client,select(0n)),"EVIDENCE_REJECTED");
  f.currentDeployment={...deployment,provider:"legacy"};await rejects(commitHostedSelection(client,select(0n)),"EVIDENCE_REJECTED");assert.equal(f.writes,0);
});
test("unavailable or mismatched runtime cannot be selected",async()=>{
  const {client,f}=fixture();for(const e of [{state:"inactive"},{state:"unavailable"},
    {state:"verified-active",activation:{...activation,sourceVersion:8}}] as const)
    await rejects(commitHostedSelection(client,select(0n,e)),"EVIDENCE_REJECTED");assert.equal(f.writes,0);
});
test("exact timestamp mismatch denies reconciliation",async()=>{
  const {client}=fixture(selected);const o=await observeOwnedHostedSelection(client,scope,
    {state:"verified-active",activation:{...activation,activatedAt:"2026-11-25T17:40:00.123457+00:00"}});
  assert.deepEqual(o.evidence,{state:"denied",reason:"RUNTIME_MISMATCH"});
});
test("conditional write losing CAS cannot update selection",async()=>{
  const {client,f}=fixture(selected);f.loseCas=true;await rejects(commitHostedSelection(client,unpublish(1n)),"STALE_GENERATION");assert.equal(f.writes,0);
});
test("unique and serialization conflicts are surfaced without retry",async()=>{
  for(const code of ["P2002","P2034"]){const {client,f}=fixture();f.conflict=code;
    await rejects(commitHostedSelection(client,select(0n)),"WRITE_CONFLICT");assert.equal(f.isolation.length,1);}
});
test("database read failure denies reconciliation",async()=>{
  const {client,f}=fixture(selected);f.conflict="P1001";
  assert.deepEqual(await observeOwnedHostedSelection(client,scope,runtime),{generation:null,evidence:{state:"denied",reason:"AUTHORITY_UNAVAILABLE"}});
});
test("generation limits prevent overflow and negative input",async()=>{
  const {client}=fixture({...selected,generation:9223372036854775807n});
  await rejects(commitHostedSelection(client,unpublish(-1n)),"INVALID_INPUT");
  await rejects(commitHostedSelection(client,unpublish(9223372036854775807n)),"GENERATION_EXHAUSTED");
});
test("missing owner or project identity cannot become an omitted Prisma filter",async()=>{
  const {client,f}=fixture();
  await rejects(commitHostedSelection(client,{...select(0n),ownerId:undefined as unknown as string}),"INVALID_INPUT");
  await rejects(commitHostedSelection(client,{...select(0n),buildProjectId:undefined as unknown as string}),"INVALID_INPUT");
  await rejects(commitHostedSelection(client,{...select(0n),deploymentId:undefined as unknown as string}),"INVALID_INPUT");
  assert.equal(f.isolation.length,0);
});
