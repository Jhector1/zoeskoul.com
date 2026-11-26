import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { loadCurrentBuildAccessSnapshot } from "./currentBuildAccess";
import { resolveBuildAccess } from "@zoeskoul/build-application";
import { productionHostedRequest } from "./hostedProductionPolicy";
import { createHostedPublicDomain } from "./hostedPublicDomain";
import { hostedPublishSelection } from "./privatePublishControl";
import { allowsDedicatedFencedDevOperator } from "./hostedFencedDevAdmission";
import { pendingIntent, fencedBundleKey } from "./hostedFencedRelease";
import { executeOwnedFencedPublication, recoverOwnedFencedPublication } from "./hostedFencedPublication";
import { HOSTED_RUNTIME_KIND, HOSTED_RUNTIME_PROVIDER } from "./hostedActivationEvidence";
import { isValidReservation } from "./hostedHostname";
import { createZoeBuildPrivateR2PublishBundleStore } from "./cloudflareR2MediaServer";
const PROJECT="cmwvhcusk0002u0dlwhxh9uh2";
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{4,128}$/;
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const fail=(code:string,status:number)=>reply({ok:false,code},status);
export function dedicatedFencedUiSelected(projectId:string,env:Readonly<Record<string,string|undefined>>=process.env){
  return projectId===PROJECT && env.NODE_ENV==="development" && env.VERCEL_ENV!=="production" && env.ZOEBUILD_PUBLISH_ENABLED==="0" && env.ZOEBUILD_HOSTED_PUBLISH_DEV==="1" && env.ZOEBUILD_HOSTED_FENCED_DEV==="1" && env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT===projectId;
}
type Scope={ownerId:string;projectId:string;publicOrigin?:string;controlOrigin?:string};
const where=(s:Scope)=>({id:s.projectId,status:{not:"archived" as const},stackId:"tanstack-start-v1",codeProject:{ownerId:s.ownerId,archivedAt:null}});
function need(v:unknown):asserts v {if(!v)throw new Error("FENCED_HISTORY_INVALID");}
// The existing UI uses publicUrl for both public and private deployments.
// This URL is only usable through the explicitly configured local development tunnel.
export function dedicatedPrivateSiteUrl(hostname:string):string {
 if(!isValidReservation(hostname))throw new Error("FENCED_PRIVATE_HOSTNAME_INVALID");
 return `http://${hostname}:33109/`;
}
// The read model is committed database history, never proof of public reachability.
async function snapshot(s:Scope){
 return prisma.$transaction(async tx=>{
  const p=await tx.buildProject.findFirst({where:where(s),select:{hostedHostname:{select:{hostname:true}},hostedActivation:{select:{generation:true,deploymentId:true,activationToken:true}}}});
  need(p);const hostname=p.hostedHostname?.hostname??null;need(hostname===null||isValidReservation(hostname));
  const generation=p.hostedActivation?.generation??0n;
  const pending=await tx.buildHostedPublicationOperation.findFirst({where:{buildProjectId:s.projectId,completedAt:null}});
  const latest=await tx.buildHostedPublicationOperation.findFirst({where:{buildProjectId:s.projectId,completedAt:{not:null}},orderBy:{expectedGeneration:"desc"}});
  need(generation===0n?!latest:latest?.expectedGeneration===generation-1n && latest.requestedByOwnerId===s.ownerId);
  const rows=await tx.buildHostedPublicationOperation.findMany({where:{buildProjectId:s.projectId,requestedByOwnerId:s.ownerId,completedAt:{not:null},targetDeploymentId:{not:null},action:{in:["publish","rollback"]}},distinct:["targetDeploymentId"],orderBy:{expectedGeneration:"desc"},take:s.publicOrigin?3:5});
  const releases=[];
  for(const row of rows){
   need(hostname);const intent=pendingIntent({...s,hostname},row);need(intent.target&&row.completedAt);
   const t=intent.target;
   const d=await tx.buildDeployment.findFirst({where:{id:t.deploymentId,buildProjectId:s.projectId,sourceVersion:t.sourceVersion,artifactHash:t.artifactHash,providerRef:t.objectSha256,provider:HOSTED_RUNTIME_PROVIDER,kind:HOSTED_RUNTIME_KIND,environment:"production",status:"ready",hostname}});
   need(d);releases.push({deploymentId:t.objectSha256,recordDeploymentId:t.deploymentId,sourceVersion:t.sourceVersion,artifactHash:t.artifactHash,createdAt:d.createdAt.toISOString()});
  }
  let active: {deploymentId:string;sourceVersion:number;artifactHash:string;deployedAt:string;publicUrl:string;privatePilot?:true;fenced:true;hostname:string}|null=null;
  if(p.hostedActivation?.deploymentId){
   const a=p.hostedActivation;
   need(latest&&latest.requestedByOwnerId===s.ownerId&&latest.targetDeploymentId===a.deploymentId&&latest.activationToken===a.activationToken&&a.activationToken&&hostname);
   const d=releases.find(r=>r.recordDeploymentId===a.deploymentId);need(d&&latest.targetObjectSha256===d.deploymentId&&latest.targetArtifactHash===d.artifactHash&&latest.targetSourceVersion===d.sourceVersion);
   active={deploymentId:d.deploymentId,sourceVersion:d.sourceVersion,artifactHash:d.artifactHash,deployedAt:a.activationToken,publicUrl:s.publicOrigin&&s.controlOrigin?`https://${createHostedPublicDomain(s.publicOrigin,s.controlOrigin).publicHostname(hostname)}/`:dedicatedPrivateSiteUrl(hostname),...(s.publicOrigin?{}:{privatePilot:true as const}),fenced:true as const,hostname:s.publicOrigin&&s.controlOrigin?createHostedPublicDomain(s.publicOrigin,s.controlOrigin).publicHostname(hostname):hostname};
  } else {need(!p.hostedActivation?.activationToken&&(!latest||latest.action==="unpublish"));}
  if(pending){need(hostname&&pending.expectedGeneration===generation);pendingIntent({...s,hostname},pending);}
  return {hostname,generation,pending,history:{active,releases,generation:generation.toString(),hostname:hostname&&s.publicOrigin&&s.controlOrigin?createHostedPublicDomain(s.publicOrigin,s.controlOrigin).publicHostname(hostname):hostname,pending:pending?{operationId:pending.id,action:pending.action}:null,fenced:true as const,publicHosting:!!s.publicOrigin,retentionLimit:s.publicOrigin?3:5,browserAccess:!!s.publicOrigin}};
 },{isolationLevel:"RepeatableRead"});
}
export function parseFencedManagement(headers:Headers){
 const action=headers.get("x-zoebuild-release-action");
 const generation=headers.get("x-zoebuild-fenced-generation");
 const target=headers.get("x-zoebuild-release-target");
 const operationId=headers.get("x-zoebuild-fenced-operation");
 if(!generation||!/^(0|[1-9][0-9]{0,18})$/.test(generation)||BigInt(generation)>=9223372036854775807n)return null;
 if(action==="restore"&&target&&HEX.test(target)&&operationId===null)return {action,generation:BigInt(generation),target,operationId};
 if(action==="unpublish"&&target===null&&operationId===null)return {action,generation:BigInt(generation),target,operationId};
 if((action==="recover"||action==="retry")&&target===null&&operationId&&ID.test(operationId))return {action,generation:BigInt(generation),target,operationId};
 return null;
}
export async function manageDedicatedFenced(req:Request,ctx:{params:Promise<{buildProjectId:string}>}){
 const {buildProjectId:projectId}=await ctx.params;
 const origin=new URL(req.url).origin;
 const production=productionHostedRequest(origin,projectId,process.env);
 const selection=production??hostedPublishSelection(origin,projectId,process.env);
 if((!production&&!dedicatedFencedUiSelected(projectId))||!selection)return fail("BUILD_PILOT_DISABLED",404);
 if(req.method!=="GET"&&req.method!=="POST")return fail("BUILD_PILOT_INPUT_INVALID",400);
 if(req.method==="POST"&&(!enforceSameOriginPost(req)||req.body!==null||![null,"0"].includes(req.headers.get("content-length"))))return fail("BUILD_FORBIDDEN",403);
 try{
  const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
  if(!access.userId)return fail("BUILD_AUTH_REQUIRED",401);
  if(production ? access.userId!==production.ownerId : !allowsDedicatedFencedDevOperator({origin,projectId,userId:access.userId,selectedOwnerId:selection.ownerId,env:process.env}))return fail("BUILD_FORBIDDEN",403);
  const s:Scope={ownerId:access.userId,projectId,...(production?{publicOrigin:production.publicOrigin,controlOrigin:production.controlOrigin}:{})};
  const current=await snapshot(s);
  if(req.method==="GET")return reply({ok:true,history:current.history});
  const m=parseFencedManagement(req.headers);if(!m)return fail("BUILD_PILOT_INPUT_INVALID",400);
   if(production && (m.action==="restore" || (m.action==="retry"&&current.pending?.action!=="unpublish")) && !resolveBuildAccess(access).canPublish)return fail("BUILD_FORBIDDEN",403);
  const limited=await rateLimit(`zoebuild-fenced-management:${s.ownerId}:${projectId}`,{bucket:"zoebuild-fenced-management",limit:30,window:"1 h"});if(!limited.ok)return fail("BUILD_RATE_LIMITED",429);
  if(m.generation!==current.generation)return fail("BUILD_FENCED_STALE_GENERATION",409);
  if(!current.hostname)return fail("BUILD_HOSTED_RESERVATION_REQUIRED",409);
  const scope={...s,hostname:current.hostname};
  if(m.action==="recover"||m.action==="retry"){
   if(!current.pending||current.pending.id!==m.operationId)return fail("BUILD_FENCED_PENDING_MISMATCH",409);
   const input=pendingIntent(scope,current.pending);
   const recovered=await recoverOwnedFencedPublication(prisma,input);
   if(recovered.state!=="completed"&&m.action==="retry"){
    let bytes:Uint8Array|undefined;
    if(input.action==="publish"){
     const value=await createZoeBuildPrivateR2PublishBundleStore().read(fencedBundleKey(s.ownerId,s.projectId,input.target));
     need(value&&createHash("sha256").update(value).digest("hex")===input.target.objectSha256);bytes=value;
    }
    await executeOwnedFencedPublication(prisma,input,bytes);
   }
  } else {
   if(current.pending)return fail("BUILD_FENCED_OPERATION_PENDING",409);
   const base={...s,operationId:randomUUID(),expectedGeneration:m.generation};
   if(m.action==="unpublish"){
    if(!current.history.active)return fail("BUILD_FENCED_NOT_ACTIVE",409);
    await executeOwnedFencedPublication(prisma,{...base,action:"unpublish",target:null});
   } else {
    const t=current.history.releases.find(r=>r.deploymentId===m.target);
    if(!t||current.history.active?.deploymentId===t.deploymentId)return fail("BUILD_FENCED_TARGET_INVALID",409);
    await executeOwnedFencedPublication(prisma,{...base,action:"rollback",target:{deploymentId:t.recordDeploymentId,sourceVersion:t.sourceVersion,artifactHash:t.artifactHash,objectSha256:t.deploymentId}});
   }
  }
  const after=await snapshot(s);return reply({ok:!after.pending,history:after.history,...(after.pending?{code:"BUILD_FENCED_OPERATION_PENDING"}:{})},after.pending?409:200);
 }catch{return fail("BUILD_FENCED_MANAGEMENT_UNCONFIRMED",503);}
}
