import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import type { TanstackPublishArtifactReference } from "./tanstackPublishArtifact";
import type { PendingHostedPublication } from "./hostedPublicationRecovery";
import { HOSTED_RUNTIME_KIND, HOSTED_RUNTIME_PROVIDER } from "./hostedActivationEvidence";
import { executeOwnedFencedPublication, recoverOwnedFencedPublication } from "./hostedFencedPublication";
import { hostedPublishSelection, invokeHostedFencedCommand } from "./privatePublishControl";
import { parseFencedStatus } from "./hostedFencedProtocol";
import { isValidReservation } from "./hostedHostname";
import { productionHostedSelection } from "./hostedProductionPolicy";

type Scope = Readonly<{ownerId:string;projectId:string;hostname:string}>;
type Store = {read(key:string):Promise<Uint8Array|null|undefined>};
const ID=/^[A-Za-z0-9_-]{4,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const hash=(b:string|Uint8Array)=>createHash("sha256").update(b).digest("hex");
function need(v:unknown,code:string):asserts v {if(!v)throw new Error(code);}
export function selectsFencedRelease(projectId:string,env:Readonly<Record<string,string|undefined>>):boolean {
  return !!productionHostedSelection(projectId,env) || (env.ZOEBUILD_HOSTED_FENCED_DEV==="1" && env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT===projectId);
}
function scopeWhere(s:Scope){
  need(ID.test(s.ownerId)&&ID.test(s.projectId)&&isValidReservation(s.hostname),"FENCED_SCOPE_INVALID");
  const selected=productionHostedSelection(s.projectId,process.env)??hostedPublishSelection("http://localhost:3004",s.projectId,process.env);
  need(selectsFencedRelease(s.projectId,process.env)&&selected?.ownerId===s.ownerId,"FENCED_RELEASE_DISABLED");
  return {id:s.projectId,status:{not:"archived" as const},stackId:"tanstack-start-v1",codeProject:{ownerId:s.ownerId,archivedAt:null},hostedHostname:{is:{hostname:s.hostname}}};
}
export function fencedBundleKey(ownerId:string,projectId:string,target:{sourceVersion:number;artifactHash:string;objectSha256:string}){
  need(ID.test(ownerId)&&ID.test(projectId)&&Number.isSafeInteger(target.sourceVersion)&&target.sourceVersion>0&&target.sourceVersion<=2147483647&&HEX.test(target.artifactHash)&&HEX.test(target.objectSha256),"FENCED_BUNDLE_IDENTITY_INVALID");
  return `published-artifacts/${ownerId}/${projectId}/${target.sourceVersion}/${target.artifactHash}/${target.objectSha256}`;
}
export function verifyFencedCandidate(s:Scope,ref:TanstackPublishArtifactReference,bytes:Uint8Array){
  const target={sourceVersion:ref.sourceVersion,artifactHash:ref.artifactSha256,objectSha256:ref.objectSha256};
  need(ref.kind==="worker-bundle-v1"&&ref.ownerId===s.ownerId&&ref.buildProjectId===s.projectId&&HEX.test(ref.snapshotSha256)&&ref.objectKey===fencedBundleKey(s.ownerId,s.projectId,target)&&bytes.byteLength>0&&bytes.byteLength<=56*1024*1024&&hash(bytes)===ref.objectSha256&&Number.isSafeInteger(ref.artifactFiles)&&ref.artifactFiles>0&&ref.artifactFiles<=2147483647&&Number.isSafeInteger(ref.artifactBytes)&&ref.artifactBytes>0&&ref.artifactBytes<=2147483647,"FENCED_ARTIFACT_INVALID");
  return {deploymentId:`hosted-${hash(JSON.stringify([s.projectId,ref.sourceVersion,ref.artifactSha256,ref.objectSha256]))}`,...target};
}
type Journal = {id:string;buildProjectId:string;requestedByOwnerId:string;expectedGeneration:bigint;action:string;targetDeploymentId:string|null;targetSourceVersion:number|null;targetArtifactHash:string|null;targetObjectSha256:string|null};
export function pendingIntent(s:Scope,r:Journal):PendingHostedPublication & {ownerId:string}{
  need(r.buildProjectId===s.projectId&&r.requestedByOwnerId===s.ownerId&&ID.test(r.id)&&r.expectedGeneration>=0n,"FENCED_PENDING_SCOPE_INVALID");
  const base={ownerId:s.ownerId,projectId:s.projectId,operationId:r.id,expectedGeneration:r.expectedGeneration};
  if(r.action==="unpublish"){
    need(r.targetDeploymentId===null&&r.targetSourceVersion===null&&r.targetArtifactHash===null&&r.targetObjectSha256===null,"FENCED_PENDING_TARGET_INVALID");
    return {...base,action:"unpublish",target:null};
  }
  need((r.action==="publish"||r.action==="rollback")&&r.targetDeploymentId&&ID.test(r.targetDeploymentId)&&r.targetSourceVersion!==null&&r.targetArtifactHash&&r.targetObjectSha256,"FENCED_PENDING_TARGET_INVALID");
  const target={deploymentId:r.targetDeploymentId,sourceVersion:r.targetSourceVersion,artifactHash:r.targetArtifactHash,objectSha256:r.targetObjectSha256};
  fencedBundleKey(s.ownerId,s.projectId,target);
  return {...base,action:r.action,target};
}
/** Owner-scoped recovery only. A second Publish click reads the durable acknowledgement;
 * redispatch requires an explicit exact operation id and uses only the original bundle. */
export async function inspectFencedRelease(client:PrismaClient,s:Scope,retryId:string|null,store:()=>Store){
  const filter=scopeWhere(s);
  const state=await client.$transaction(async tx=>{
    const p=await tx.buildProject.findFirst({where:filter,select:{hostedActivation:{select:{generation:true}}}});
    need(p,"FENCED_PROJECT_DENIED");
    const pending=await tx.buildHostedPublicationOperation.findFirst({where:{buildProjectId:s.projectId,completedAt:null}});
    return {generation:p.hostedActivation?.generation??0n,pending};
  },{isolationLevel:"RepeatableRead"});
  if(state.pending){
    const input=pendingIntent(s,state.pending);
    need(retryId===null||retryId===input.operationId,"FENCED_RETRY_MISMATCH");
    const recovered=await recoverOwnedFencedPublication(client,input);
    if(recovered.state==="completed")return {state:"completed" as const,record:recovered};
    if(retryId===null)return {state:"pending" as const,operationId:input.operationId};
    need(input.action==="publish","FENCED_RETRY_REQUIRES_MANAGEMENT");
    const bytes=await store().read(fencedBundleKey(s.ownerId,s.projectId,input.target));
    need(bytes&&hash(bytes)===input.target.objectSha256,"FENCED_RETRY_BUNDLE_INVALID");
    const result=await executeOwnedFencedPublication(client,input,bytes);
    return result.state==="completed"?{state:"completed" as const,record:result}:{state:"pending" as const,operationId:input.operationId};
  }
  need(retryId===null,"FENCED_RETRY_NOT_FOUND");
  const runtime=parseFencedStatus(await invokeHostedFencedCommand(s.ownerId,s.projectId,"fenced-ack"),s.projectId);
  need(runtime.fence===state.generation,"FENCED_RUNTIME_GENERATION_MISMATCH");
  return {state:"new" as const,generation:state.generation};
}
/** A ready target is verified build material, not proof of active serving.
 * Never modify an existing artifact/deployment to force identity equality. */
export async function publishFencedRelease(client:PrismaClient,s:Scope,generation:bigint,ref:TanstackPublishArtifactReference,bytes:Uint8Array){
  const filter=scopeWhere(s),target=verifyFencedCandidate(s,ref,bytes);
  await client.$transaction(async tx=>{
    const p=await tx.buildProject.findFirst({where:{...filter,codeProject:{...filter.codeProject,currentVersion:ref.sourceVersion}},select:{hostedActivation:{select:{generation:true}}}});
    need(p&&(p.hostedActivation?.generation??0n)===generation,"FENCED_SOURCE_OR_GENERATION_CHANGED");
    need(!await tx.buildHostedPublicationOperation.findFirst({where:{buildProjectId:s.projectId,completedAt:null},select:{id:true}}),"FENCED_OPERATION_PENDING");
    const data={buildProjectId:s.projectId,sourceVersion:ref.sourceVersion,artifactHash:ref.artifactSha256,kind:ref.kind,provider:HOSTED_RUNTIME_PROVIDER,outputPath:ref.objectKey,fileCount:ref.artifactFiles,totalBytes:ref.artifactBytes};
    const existing=await tx.buildArtifact.findFirst({where:{buildProjectId:data.buildProjectId,sourceVersion:data.sourceVersion,artifactHash:data.artifactHash}});
    const a=existing??await tx.buildArtifact.create({data});
    need(a.kind===data.kind&&a.provider===data.provider&&a.outputPath===data.outputPath&&a.fileCount===data.fileCount&&a.totalBytes===data.totalBytes,"FENCED_ARTIFACT_RECORD_CONFLICT");
    const d={id:target.deploymentId,buildProjectId:s.projectId,buildArtifactId:a.id,sourceVersion:target.sourceVersion,environment:"production",kind:HOSTED_RUNTIME_KIND,provider:HOSTED_RUNTIME_PROVIDER,providerRef:target.objectSha256,status:"ready" as const,hostname:s.hostname,artifactHash:target.artifactHash};
    const saved=await tx.buildDeployment.findUnique({where:{id:d.id}})??await tx.buildDeployment.create({data:d});
    need(saved.buildProjectId===d.buildProjectId&&saved.buildArtifactId===d.buildArtifactId&&saved.sourceVersion===d.sourceVersion&&saved.environment===d.environment&&saved.kind===d.kind&&saved.provider===d.provider&&saved.providerRef===d.providerRef&&saved.status===d.status&&saved.hostname===d.hostname&&saved.artifactHash===d.artifactHash,"FENCED_DEPLOYMENT_RECORD_CONFLICT");
  },{isolationLevel:"Serializable"});
  const input={...s,operationId:randomUUID(),expectedGeneration:generation,action:"publish" as const,target};
  // Existing executor persists the intent before invoking the provider.
  return executeOwnedFencedPublication(client,input,bytes);
}
