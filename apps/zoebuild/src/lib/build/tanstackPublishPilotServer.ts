import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getBuildProjectCommand, resolveBuildAccess } from "@zoeskoul/build-application";
import { createRegisteredProductionBuildJob } from "@zoeskoul/build-preparation";
import type { TanstackWorkerBuildExecutionResponseV1 } from "@zoeskoul/build-executor-contracts";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { executeTrustedProductionBuildAtRunner } from "@/lib/build/buildExecutorValidation";
import { createZoeBuildPrivateR2PublishBundleStore } from "@/lib/build/cloudflareR2MediaServer";
import { stageTanstackPublishArtifact } from "@/lib/build/tanstackPublishArtifact";
import { allowsTanstackPublishPilot } from "@/lib/build/tanstackPublishPilotPolicy";
import { privatePublishSelection, hostedPublishSelection, invokeHostedPublishControl, invokePrivatePublishControl, invokePrivateReleaseManagement, type PrivateReleaseMutation, type PrivatePublishReceipt } from "@/lib/build/privatePublishControl";
import { isValidReservation, reserveHostedHostname } from "@/lib/build/hostedHostname";
import { inspectFencedRelease, publishFencedRelease, selectsFencedRelease } from "@/lib/build/hostedFencedRelease";
import type { HostedPublicationRecord } from "@/lib/build/hostedPublicationExecutor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { allowsDedicatedFencedDevOperator } from "@/lib/build/hostedFencedDevAdmission";
import { productionHostedRequest } from "@/lib/build/hostedProductionPolicy";


// This opt-in local lane runs one editor server. Share the mutation guard
// across Next route modules in that process. The VM separately locks activation.
const mutationGlobal=globalThis as typeof globalThis & {__zoeBuildPrivatePublishMutations?:Set<string>};
const mutations=mutationGlobal.__zoeBuildPrivatePublishMutations ??= new Set<string>();
const reply = (code:string,status:number) => NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});

// A committed operation receipt is historical, not proof of public serving.
function fencedCommitted(record:Extract<HostedPublicationRecord,{state:"completed"}>,hostname:string,recovered:boolean) {
  const {operation,generation,activationToken}=record;
  const t=operation.target;
  return NextResponse.json({ok:true,state:"committed",publicationOperationId:operation.operationId,generation:generation.toString(),
    action:operation.action,deployment:t&&activationToken?{deploymentId:t.objectSha256,recordDeploymentId:t.deploymentId,sourceVersion:t.sourceVersion,artifactHash:t.artifactHash,deployedAt:activationToken,hostname,reused:recovered}:null,
    browserAccess:false},{headers:{"Cache-Control":"no-store"}});
}
function fencedPending(operationId:string) {
  return NextResponse.json({ok:false,code:"BUILD_FENCED_OPERATION_PENDING",operationId,browserAccess:false},{status:409,headers:{"Cache-Control":"no-store"}});
}

async function emptyBody(req:Request):Promise<boolean> {
  const length=req.headers.get("content-length");
  if(length!==null && length!=="0")return false;
  if(!req.body)return true;
  const reader=req.body.getReader();
  try {
    for(;;){const item=await reader.read();if(item.done)return true;if(item.value.byteLength){void reader.cancel().catch(()=>{});return false;}}
  }catch{return false;}finally{reader.releaseLock();}
}

/** Shared private staging path; activation is only available to the explicit local operator. */
export async function runPrivatePublish(req:Request, ctx:{params:Promise<{buildProjectId:string}>}, activate=false, hosted=false) {
  const {buildProjectId} = await ctx.params;
  const origin = new URL(req.url).origin;
  const production=hosted&&activate?productionHostedRequest(origin,buildProjectId,process.env):null;
  if (!production && ((hosted && !activate) || process.env.NODE_ENV !== "development" || process.env.ZOEBUILD_PUBLISH_ENABLED !== "0" || (!activate && !process.env.ZOEBUILD_PRIVATE_PUBLISH_PILOT)))
    return reply("BUILD_PILOT_DISABLED",404);
  if (!enforceSameOriginPost(req)) return reply("BUILD_FORBIDDEN",403);
  if (!production && !["http://localhost:3004","http://127.0.0.1:3004"].includes(origin)) return reply("BUILD_PILOT_DISABLED",404);
  // Manual staging remains pinned to one exact revision. The separate local
  // automation opt-in selects a trusted owner/project and captures its latest
  // saved revision on the server. No browser-supplied source or settings.
  const selection=production ?? (activate ? (hosted ? hostedPublishSelection : privatePublishSelection)(origin,buildProjectId,process.env) : null);
  if (activate && !selection) return reply("BUILD_PILOT_DISABLED",404);
  const fenced=hosted&&activate&&selectsFencedRelease(buildProjectId,process.env);
  const retryId=req.headers.get("x-zoebuild-fenced-retry");
  if (retryId!==null&&(!fenced||! /^[A-Za-z0-9_-]{4,128}$/.test(retryId))) return reply("BUILD_PILOT_INPUT_INVALID",400);
  const versionText = req.headers.get("x-zoebuild-pilot-version") ?? "";
  if ((!activate && !/^[1-9][0-9]{0,9}$/.test(versionText)) || !(await emptyBody(req))) return reply("BUILD_PILOT_INPUT_INVALID",400);
  let stage = "access";
  let locked=false;
  try {
    const access = await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    if (!access.userId) return reply("BUILD_AUTH_REQUIRED",401);
    if (activate ? access.userId!==selection!.ownerId : !allowsTanstackPublishPilot({origin,projectId:buildProjectId,sourceVersion:Number(versionText),canPublish:resolveBuildAccess(access).canPublish,userId:access.userId,env:process.env}))
      return reply("BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED",403);
    // This exact development operator lane mirrors the legacy local pilot's
    // explicit admission. It grants no production or general billing capability.
    if (fenced && !resolveBuildAccess(access).canPublish && !allowsDedicatedFencedDevOperator({
      origin,projectId:buildProjectId,userId:access.userId,selectedOwnerId:selection!.ownerId,env:process.env
    })) return reply("BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED",403);
    if (activate) {
      if (mutations.has(buildProjectId)) return reply("BUILD_PILOT_MUTATION_BUSY",409);
      mutations.add(buildProjectId);locked=true;
    }
    stage="admission";
    const limited=await rateLimit(`zoebuild-publish-pilot:${access.userId}:${buildProjectId}`,{bucket:"zoebuild-publish-pilot",limit:4,window:"1 h"});
    if (!limited.ok) return reply("BUILD_RATE_LIMITED",429);
    stage="read";
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project) return reply("BUILD_PROJECT_NOT_FOUND",404);
    const sourceVersion=activate ? project.sourceVersion : Number(versionText);
    if (!Number.isSafeInteger(sourceVersion) || sourceVersion<1 || project.status==="archived" || project.sourceVersion!==sourceVersion || project.stackId!=="tanstack-start-v1" || !project.specification)
      return reply("BUILD_PILOT_SOURCE_OR_STACK_INVALID",409);
    const currentWhere={id:buildProjectId,status:{not:"archived" as const},codeProject:{ownerId:access.userId,archivedAt:null,currentVersion:sourceVersion}};
    let hostname:string|undefined;
    if (hosted) {
      stage="hostname";
      const readReservation=()=>prisma.buildProject.findFirst({where:{...currentWhere,stackId:"tanstack-start-v1"},select:{hostedHostname:{select:{hostname:true}}}});
      let reserved=await readReservation();
      // Only the admitted, owner-authorized dedicated fenced development lane
      // may allocate a missing reservation. Recheck the saved source afterwards.
      if (fenced && reserved && !reserved.hostedHostname) {
        await reserveHostedHostname(prisma,{ownerId:access.userId,buildProjectId});
        reserved=await readReservation();
      }
      const name=reserved?.hostedHostname?.hostname;
      if (!name || !isValidReservation(name)) return reply("BUILD_HOSTED_RESERVATION_REQUIRED",409);
      hostname=name;
    }
    const recheckCurrent=()=>prisma.buildProject.findFirst({where:{...currentWhere,...(hostname?{stackId:"tanstack-start-v1",hostedHostname:{is:{hostname}}}:{})},select:{id:true}});
    const control=hosted ? invokeHostedPublishControl : invokePrivatePublishControl;
    const result=(deployment:PrivatePublishReceipt,reused:boolean)=> {
      // A reservation is not a browser-accessible URL. Never return the legacy
      // receipt's fixed private site URL in the hosted lane.
      if (hostname) return NextResponse.json({ok:true,deployment:{deploymentId:deployment.deploymentId,sourceVersion:deployment.sourceVersion,artifactHash:deployment.artifactHash,deployedAt:deployment.deployedAt,hostname,reused},browserAccess:false},{headers:{"Cache-Control":"no-store"}});
      return NextResponse.json({ok:true,deployment:{...deployment,reused}},{headers:{"Cache-Control":"no-store"}});
    };
    const fencedScope=fenced&&hostname?{ownerId:access.userId,projectId:buildProjectId,hostname}:null;
    let fencedGeneration:bigint|null=null;
    if (fenced) {
      if (!fencedScope) return reply("BUILD_HOSTED_RESERVATION_REQUIRED",409);
      stage="fenced-recovery";
      const checked=await inspectFencedRelease(prisma,fencedScope,retryId,createZoeBuildPrivateR2PublishBundleStore);
      if (checked.state==="completed") return fencedCommitted(checked.record,fencedScope.hostname,true);
      if (checked.state==="pending") return fencedPending(checked.operationId);
      fencedGeneration=checked.generation;
    } else if (activate) {
      stage="deployment-status";
      const active=await control("status", {projectId:buildProjectId});
      if (active && active.sourceVersion===sourceVersion) {
        stage="recheck";
        const current=await recheckCurrent();
        if (!current) return reply("BUILD_PILOT_SOURCE_CHANGED",409);
        return result(active,true);
      }
    }
    stage="prepare";
    const request=createRegisteredProductionBuildJob({workspace:project.workspace,buildProjectId,specification:project.specification,sourceVersion});
    stage="storage-config";
    const store=createZoeBuildPrivateR2PublishBundleStore();
    stage="compile";
    const actorKey=await requireRunnerActorKey(access.userId);
    let execution:unknown;
    try {
      execution=await executeTrustedProductionBuildAtRunner({actorKey,request});
    } catch(error) {
      // Only the owner-authorized local hosted lane receives the existing
      // transport-validated diagnostic. Never return error.message or stderr.
      if (hosted && error instanceof RunnerHttpError && error.buildDiagnostic &&
          ((error.status===422 && error.code==="BUILD_COMPILATION_REJECTED") ||
           (error.status===502 && error.code==="BUILD_DEPENDENCY_INSTALL_FAILED") ||
           (error.status===504 && error.code==="BUILD_RUNNER_STEP_TIMEOUT"))) {
        return NextResponse.json({ok:false,code:"BUILD_PILOT_COMPILE_FAILED",runnerCode:error.code,buildDiagnostic:error.buildDiagnostic},{status:503,headers:{"Cache-Control":"no-store"}});
      }
      throw error;
    }
    // The existing transport's static response type predates Worker output. PUB1A validates the entire unknown receipt.
    stage="stage-artifact";
    const reference=await stageTanstackPublishArtifact({ownerId:access.userId,request,execution:execution as TanstackWorkerBuildExecutionResponseV1,store});
    stage="readback";
    const bytes=await store.read(reference.objectKey);
    if (!bytes || createHash("sha256").update(bytes).digest("hex")!==reference.objectSha256) throw new Error("readback mismatch");
    stage="recheck";
    const current=await recheckCurrent();
    if (!current) return reply("BUILD_PILOT_SOURCE_CHANGED",409);
    if (fenced) {
      if (!fencedScope||fencedGeneration===null) throw new Error("Fenced scope missing");
      stage="fenced-activate";
      const committed=await publishFencedRelease(prisma,fencedScope,fencedGeneration,reference,bytes);
      if (committed.state!=="completed") return reply("BUILD_FENCED_OPERATION_PENDING",409);
      return fencedCommitted(committed,fencedScope.hostname,false);
    }
    if (activate) {
      stage="activate";
      const deployment=await control("activate",{projectId:buildProjectId,sourceVersion,objectSha256:reference.objectSha256,artifactHash:reference.artifactSha256,bytes});
      if (!deployment) throw new Error("Activation receipt missing");
      return result(deployment,false);
    }
    // Owner-only download of the exact, verified private object; never a public artifact URL.
    return new Response(new Uint8Array(bytes),{status:200,headers:{"Content-Type":"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`attachment; filename="zoebuild-pilot-${reference.objectSha256}.json"`,"X-ZoeBuild-Artifact-Sha256":reference.artifactSha256,"X-ZoeBuild-Object-Sha256":reference.objectSha256}});
  } catch(error) {
    console.warn("[ZoeBuild private publishing pilot] failed",{stage,kind:error instanceof Error?error.name:"unknown"});
    return reply(`BUILD_PILOT_${stage.toUpperCase().replace(/-/g,"_")}_FAILED`,503);
  } finally {if (locked) mutations.delete(buildProjectId);}
}

/** Owner-scoped private activation hydration, never reads or mutates public deployments. */
export async function readPrivatePublish(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {
  const {buildProjectId}=await ctx.params;
  const selection=privatePublishSelection(new URL(req.url).origin,buildProjectId,process.env);
  if (!selection) return reply("BUILD_PILOT_DISABLED",404);
  try {
    const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    if (!access.userId) return reply("BUILD_AUTH_REQUIRED",401);
    if (access.userId!==selection.ownerId) return reply("BUILD_FORBIDDEN",403);
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project || project.status==="archived" || project.stackId!=="tanstack-start-v1") return reply("BUILD_PROJECT_NOT_FOUND",404);
    const deployment=await invokePrivatePublishControl("status",{projectId:buildProjectId});
    return NextResponse.json({ok:true,deployment},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return reply("BUILD_PILOT_DEPLOYMENT_STATUS_FAILED",503);
  }
}

/** Private release management uses the retained VM receipts, not the public site table. */
export async function managePrivatePublish(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {
  const {buildProjectId}=await ctx.params;
  const selection=privatePublishSelection(new URL(req.url).origin,buildProjectId,process.env);
  if (!selection) return reply("BUILD_PILOT_DISABLED",404);
  const mutate=req.method==="POST";
  if (mutate && !enforceSameOriginPost(req)) return reply("BUILD_FORBIDDEN",403);
  if (!mutate && req.method!=="GET") return reply("BUILD_PILOT_INPUT_INVALID",400);
  let mutation:PrivateReleaseMutation|undefined;
  if (mutate) {
    const action=req.headers.get("x-zoebuild-release-action");
    const target=req.headers.get("x-zoebuild-release-target");
    const current=req.headers.get("x-zoebuild-release-active");
    const at=req.headers.get("x-zoebuild-release-activated-at");
    const hex=/^[a-f0-9]{64}$/;
    if ((action!=="restore" && action!=="unpublish") || (action==="restore" ? !target || !hex.test(target) : target!==null) || (current==="none" ? at!==null : !current || !hex.test(current) || !at || at.length>64 || !Number.isFinite(Date.parse(at))) || !(await emptyBody(req))) return reply("BUILD_PILOT_INPUT_INVALID",400);
    mutation={action,target,expected:current==="none"?null:{objectSha256:current!,activatedAt:at!}};
  }
  let locked=false;
  try {
    const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    if (!access.userId) return reply("BUILD_AUTH_REQUIRED",401);
    if (access.userId!==selection.ownerId) return reply("BUILD_FORBIDDEN",403);
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project || project.status==="archived" || project.stackId!=="tanstack-start-v1") return reply("BUILD_PROJECT_NOT_FOUND",404);
    if (mutation) {
      if (mutations.has(buildProjectId)) return reply("BUILD_PILOT_MUTATION_BUSY",409);
      mutations.add(buildProjectId);locked=true;
      const limited=await rateLimit(`zoebuild-private-release-management:${access.userId}:${buildProjectId}`,{bucket:"zoebuild-private-release-management",limit:30,window:"1 h"});
      if (!limited.ok) return reply("BUILD_RATE_LIMITED",429);
    }
    const history=await invokePrivateReleaseManagement(buildProjectId,mutation);
    return NextResponse.json({ok:true,history},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return reply("BUILD_PILOT_RELEASE_MANAGEMENT_FAILED",503);
  } finally {if (locked) mutations.delete(buildProjectId);}
}
