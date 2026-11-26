import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import { HOSTED_RUNTIME_KIND, HOSTED_RUNTIME_PROVIDER, type HostedDeploymentRecord } from "./hostedActivationEvidence";
import { planHostedPublicationRecovery, type PendingHostedPublication, type HostedOperationAcknowledgement,
  type HostedPublicationRecoveryDecision } from "./hostedPublicationRecovery";

// Internal DB primitives only. No browser API, provider dispatch, entitlement
// grant or public authorization. The legacy selection primitive must not be
// used by the future journal-managed publishing lane.
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const MAX = 9223372036854775807n;
const HEX = /^[a-f0-9]{64}$/;
const fields = {id:true,buildProjectId:true,sourceVersion:true,environment:true,
  provider:true,kind:true,status:true,artifactHash:true,providerRef:true} as const;
const projectFields = {id:true,status:true,stackId:true,codeProject:{select:{archivedAt:true}},
  hostedActivation:{select:{generation:true}}} as const;
type Scope = Readonly<{ownerId:string;projectId:string}>;
type Begin = PendingHostedPublication & Readonly<{ownerId:string}>;
type Finish = Scope & Readonly<{operationId:string;acknowledgement:HostedOperationAcknowledgement|null}>;
type Row = Readonly<{id:string;buildProjectId:string;requestedByOwnerId:string;expectedGeneration:bigint;
  action:string;targetDeploymentId:string|null;targetSourceVersion:number|null;targetArtifactHash:string|null;
  targetObjectSha256:string|null;activationToken:string|null;completedAt:Date|null}>;
export type HostedPublicationRecord = Readonly<{operation:PendingHostedPublication}> &
  (Readonly<{state:"pending"}> | Readonly<{state:"completed";generation:bigint;activationToken:string|null}>);
type Reason = Extract<HostedPublicationRecoveryDecision,{state:"blocked"}>["reason"] |
  "INVALID_INPUT"|"NOT_FOUND"|"OPERATION_ID_REUSED"|"OPERATION_PENDING"|"WRITE_CONFLICT"|"INVALID_JOURNAL";
export class HostedPublicationError extends Error {
  constructor(readonly code:Reason) {super(code);this.name="HostedPublicationError";}
}
function fail(code:Reason):never {throw new HostedPublicationError(code);}
function id(v:unknown):v is string {return typeof v==="string"&&ID.test(v);}
function where(s:Scope) {
  if(!id(s.ownerId)||!id(s.projectId)) fail("INVALID_INPUT");
  return {id:s.projectId,status:{not:"archived" as const},stackId:"tanstack-start-v1",
    codeProject:{ownerId:s.ownerId,archivedAt:null}};
}
function validate(o:PendingHostedPublication) {
  if(!id(o.operationId)||!id(o.projectId)||typeof o.expectedGeneration!=="bigint"||
    o.expectedGeneration<0n||o.expectedGeneration>=MAX) fail("INVALID_INTENT");
  if(o.action==="unpublish") {if(o.target!==null) fail("INVALID_INTENT");return;}
  if(o.action!=="publish"&&o.action!=="rollback") fail("INVALID_INTENT");
  const t=o.target;
  if(!t||!id(t.deploymentId)||!Number.isSafeInteger(t.sourceVersion)||t.sourceVersion<=0||
    t.sourceVersion>2147483647||typeof t.artifactHash!=="string"||!HEX.test(t.artifactHash)||
    typeof t.objectSha256!=="string"||!HEX.test(t.objectSha256)) fail("INVALID_INTENT");
}
function decode(r:Row):PendingHostedPublication {
  const base={operationId:r.id,projectId:r.buildProjectId,expectedGeneration:r.expectedGeneration};
  let o:PendingHostedPublication;
  if(r.action==="unpublish"&&r.targetDeploymentId===null&&r.targetSourceVersion===null&&r.targetArtifactHash===null&&r.targetObjectSha256===null) o={...base,action:"unpublish",target:null};
  else if((r.action==="publish"||r.action==="rollback")&&r.targetDeploymentId!==null&&r.targetSourceVersion!==null&&r.targetArtifactHash!==null&&r.targetObjectSha256!==null)
    o={...base,action:r.action,target:{deploymentId:r.targetDeploymentId,sourceVersion:r.targetSourceVersion,artifactHash:r.targetArtifactHash,objectSha256:r.targetObjectSha256}};
  else return fail("INVALID_JOURNAL");
  validate(o);return o;
}
function record(r:Row):HostedPublicationRecord {
  const operation=decode(r);
  if(r.completedAt===null){if(r.activationToken!==null) fail("INVALID_JOURNAL");return {state:"pending",operation};}
  if((operation.action==="unpublish")!==(r.activationToken===null)) fail("INVALID_JOURNAL");
  return {state:"completed",operation,generation:operation.expectedGeneration+1n,activationToken:r.activationToken};
}
function columns(o:PendingHostedPublication) {
  return {id:o.operationId,buildProjectId:o.projectId,expectedGeneration:o.expectedGeneration,action:o.action,
    targetDeploymentId:o.target?.deploymentId??null,targetSourceVersion:o.target?.sourceVersion??null,
    targetArtifactHash:o.target?.artifactHash??null,targetObjectSha256:o.target?.objectSha256??null};
}
function sameIntent(r:Row,o:PendingHostedPublication) {
  return Object.entries(columns(o)).every(([k,v])=>r[k as keyof Row]===v);
}
function targetMatches(o:PendingHostedPublication,d:HostedDeploymentRecord|null) {
  const t=o.target;
  return t===null?d===null:!!d&&d.id===t.deploymentId&&d.buildProjectId===o.projectId&&
    d.environment==="production"&&d.provider===HOSTED_RUNTIME_PROVIDER&&d.kind===HOSTED_RUNTIME_KIND&&
    d.status==="ready"&&d.sourceVersion===t.sourceVersion&&d.artifactHash===t.artifactHash&&d.providerRef===t.objectSha256;
}
function conflict(e:unknown):never {
  if(typeof e==="object"&&e!==null&&"code" in e&&(e.code==="P2002"||e.code==="P2034")) fail("WRITE_CONFLICT");
  throw e;
}

/** Persist an exact immutable intent. Replay reads the same historical journal,
 * never creates a new operation or authorizes provider dispatch. */
export async function beginHostedPublication(client:PrismaClient,input:Begin):Promise<HostedPublicationRecord> {
  const filter=where(input);validate(input);
  try{return await client.$transaction(async tx=>{
    const p=await tx.buildProject.findFirst({where:filter,select:projectFields});
    if(!p||p.id!==input.projectId||p.status==="archived"||p.stackId!=="tanstack-start-v1"||p.codeProject.archivedAt!==null) fail("PROJECT_INELIGIBLE");
    const existing=await tx.buildHostedPublicationOperation.findFirst({where:{id:input.operationId,buildProjectId:p.id,requestedByOwnerId:input.ownerId}});
    if(existing){if(!sameIntent(existing,input)) fail("OPERATION_ID_REUSED");return record(existing);}
    if((p.hostedActivation?.generation??0n)!==input.expectedGeneration) fail("STALE_GENERATION");
    const pending=await tx.buildHostedPublicationOperation.findFirst({where:{buildProjectId:p.id,completedAt:null},select:{id:true}});
    if(pending) fail("OPERATION_PENDING");
    const d=input.target?await tx.buildDeployment.findFirst({where:{id:input.target.deploymentId,buildProjectId:p.id},select:fields}):null;
    if(!targetMatches(input,d)) fail("TARGET_MISMATCH");
    const row=await tx.buildHostedPublicationOperation.create({data:{...columns(input),requestedByOwnerId:input.ownerId}});
    return record(row);
  },{isolationLevel:"Serializable"});}catch(e){return conflict(e);}
}

/** Only trusted durable provider acknowledgement may enter here. Unknown outcome
 * stays pending. Both writes share one serializable transaction; no nested
 * commitHostedSelection transaction and no automatic conflict retries. */
export async function completeHostedPublication(client:PrismaClient,input:Finish):Promise<HostedPublicationRecord|Readonly<{state:"await-provider"}>> {
  const filter=where(input);if(!id(input.operationId)) fail("INVALID_INPUT");
  try{return await client.$transaction(async tx=>{
    const p=await tx.buildProject.findFirst({where:filter,select:projectFields});
    if(!p||p.id!==input.projectId||p.status==="archived"||p.stackId!=="tanstack-start-v1"||p.codeProject.archivedAt!==null) fail("PROJECT_INELIGIBLE");
    const r=await tx.buildHostedPublicationOperation.findFirst({where:{id:input.operationId,buildProjectId:p.id,requestedByOwnerId:input.ownerId}});
    if(!r) fail("NOT_FOUND");
    const saved=record(r),o=saved.operation;
    // Historical completion is not current activation evidence. A lost response
    // can read the stored receipt; no new selection is written on replay.
    if(saved.state==="completed") return saved;
    const d=o.target?await tx.buildDeployment.findFirst({where:{id:o.target.deploymentId,buildProjectId:p.id},select:fields}):null;
    const g=p.hostedActivation?.generation??0n;
    const decision=planHostedPublicationRecovery({operation:o,project:{id:p.id,status:p.status,stackId:p.stackId,codeProjectArchived:false},
      currentGeneration:g,deployment:d,acknowledgement:input.acknowledgement});
    if(decision.state==="blocked") fail(decision.reason);
    if(decision.state==="await-provider") return decision;
    const data={generation:decision.generation,deploymentId:decision.deploymentId,activationToken:decision.activationToken};
    if(p.hostedActivation){const changed=await tx.buildHostedActivation.updateMany({where:{buildProjectId:p.id,generation:g},data});if(changed.count!==1) fail("STALE_GENERATION");}
    else await tx.buildHostedActivation.create({data:{buildProjectId:p.id,...data}});
    const completedAt=new Date();
    const done=await tx.buildHostedPublicationOperation.updateMany({where:{...columns(o),requestedByOwnerId:input.ownerId,completedAt:null,activationToken:null},
      data:{completedAt,activationToken:decision.activationToken}});
    if(done.count!==1) fail("WRITE_CONFLICT");
    return {state:"completed",operation:o,generation:decision.generation,activationToken:decision.activationToken} as const;
  },{isolationLevel:"Serializable"});}catch(e){return conflict(e);}
}
