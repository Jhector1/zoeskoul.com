import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getBuildProjectCommand, resolveBuildAccess } from "@zoeskoul/build-application";
import { createRegisteredProductionBuildJob } from "@zoeskoul/build-preparation";
import type { TanstackWorkerBuildExecutionResponseV1 } from "@zoeskoul/build-executor-contracts";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { executeTrustedProductionBuildAtRunner } from "@/lib/build/buildExecutorValidation";
import { createZoeBuildPrivateR2PublishBundleStore } from "@/lib/build/cloudflareR2MediaServer";
import { stageTanstackPublishArtifact } from "@/lib/build/tanstackPublishArtifact";
import { allowsTanstackPublishPilot } from "@/lib/build/tanstackPublishPilotPolicy";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (code:string,status:number) => NextResponse.json({ok:false,code},{status,headers:{"Cache-Control":"no-store"}});

async function emptyBody(req:Request):Promise<boolean> {
  const length=req.headers.get("content-length");
  if(length!==null && length!=="0")return false;
  if(!req.body)return true;
  const reader=req.body.getReader();
  try {
    for(;;){const item=await reader.read();if(item.done)return true;if(item.value.byteLength){void reader.cancel().catch(()=>{});return false;}}
  }catch{return false;}finally{reader.releaseLock();}
}

/** Local operator staging only. No public URL, deployment row, activation, or browser-supplied source. */
export async function POST(req:Request, ctx:{params:Promise<{buildProjectId:string}>}) {
  if (process.env.NODE_ENV !== "development" || process.env.ZOEBUILD_PUBLISH_ENABLED !== "0" || !process.env.ZOEBUILD_PRIVATE_PUBLISH_PILOT)
    return reply("BUILD_PILOT_DISABLED",404);
  if (!enforceSameOriginPost(req)) return reply("BUILD_FORBIDDEN",403);
  const origin = new URL(req.url).origin;
  if (!["http://localhost:3004","http://127.0.0.1:3004"].includes(origin)) return reply("BUILD_PILOT_DISABLED",404);
  const {buildProjectId} = await ctx.params;
  // Only one exact revision can be selected by the operator. No body, argv, provider settings or source is accepted.
  const versionText = req.headers.get("x-zoebuild-pilot-version") ?? "";
  if (!/^[1-9][0-9]{0,9}$/.test(versionText) || !(await emptyBody(req))) return reply("BUILD_PILOT_INPUT_INVALID",400);
  const sourceVersion = Number(versionText);
  let stage = "access";
  try {
    const access = await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
    if (!access.userId) return reply("BUILD_AUTH_REQUIRED",401);
    if (!allowsTanstackPublishPilot({origin,projectId:buildProjectId,sourceVersion,canPublish:resolveBuildAccess(access).canPublish,userId:access.userId,env:process.env}))
      return reply("BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED",403);
    stage="admission";
    const limited=await rateLimit(`zoebuild-publish-pilot:${access.userId}:${buildProjectId}`,{bucket:"zoebuild-publish-pilot",limit:4,window:"1 h"});
    if (!limited.ok) return reply("BUILD_RATE_LIMITED",429);
    stage="read";
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project) return reply("BUILD_PROJECT_NOT_FOUND",404);
    if (project.status==="archived" || project.sourceVersion!==sourceVersion || project.stackId!=="tanstack-start-v1" || !project.specification)
      return reply("BUILD_PILOT_SOURCE_OR_STACK_INVALID",409);
    stage="prepare";
    const request=createRegisteredProductionBuildJob({workspace:project.workspace,buildProjectId,specification:project.specification,sourceVersion});
    stage="storage-config";
    const store=createZoeBuildPrivateR2PublishBundleStore();
    stage="compile";
    const actorKey=await requireRunnerActorKey(access.userId);
    const execution:unknown=await executeTrustedProductionBuildAtRunner({actorKey,request});
    // The existing transport's static response type predates Worker output. PUB1A validates the entire unknown receipt.
    stage="stage-artifact";
    const reference=await stageTanstackPublishArtifact({ownerId:access.userId,request,execution:execution as TanstackWorkerBuildExecutionResponseV1,store});
    stage="readback";
    const bytes=await store.read(reference.objectKey);
    if (!bytes || createHash("sha256").update(bytes).digest("hex")!==reference.objectSha256) throw new Error("readback mismatch");
    stage="recheck";
    const current=await prisma.buildProject.findFirst({where:{id:buildProjectId,status:{not:"archived"},codeProject:{ownerId:access.userId,archivedAt:null,currentVersion:sourceVersion}},select:{id:true}});
    if (!current) return reply("BUILD_PILOT_SOURCE_CHANGED",409);
    // Owner-only download of the exact, verified private object; never a public artifact URL.
    return new Response(new Uint8Array(bytes),{status:200,headers:{"Content-Type":"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Disposition":`attachment; filename="zoebuild-pilot-${reference.objectSha256}.json"`,"X-ZoeBuild-Artifact-Sha256":reference.artifactSha256,"X-ZoeBuild-Object-Sha256":reference.objectSha256}});
  } catch(error) {
    console.warn("[ZoeBuild private publishing pilot] failed",{stage,kind:error instanceof Error?error.name:"unknown"});
    return reply(`BUILD_PILOT_${stage.toUpperCase().replace(/-/g,"_")}_FAILED`,503);
  }
}
