import {NextResponse} from "next/server";
import {BuildAccessError,getBuildProjectCommand} from "@zoeskoul/build-application";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {rateLimit} from "@zoeskoul/platform-server/security/ratelimit";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {createPrismaBuildProjectReader} from "@/lib/build/readBuildProjects";
import {requireZoeAiBillingOperationId,ZoeAiOperationIdentityError} from "@/lib/build/aiBillingOperationIdentity";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function reply(value:Record<string,unknown>,status=200){
 const response=NextResponse.json(value,{status});response.headers.set("Cache-Control","no-store");return response;
}
/** Read-only evidence: never retires browser IDs, releases holds, or replays AI. */
export async function GET(req:Request,ctx:{params:Promise<{buildProjectId:string}>}){
 let access:Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
 try{access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});}
 catch{return reply({ok:false,code:"SESSION_AUTHORITY_UNAVAILABLE"},503);}
 if(!access.userId)return reply({ok:false,code:"BUILD_AUTH_REQUIRED"},401);
 const {buildProjectId}=await ctx.params;
 const original=new URL(req.url).searchParams.get("operationId");
 let keys:string[];
 try{
  keys=(["intent","edit","answer"] as const).map(purpose=>
   `${requireZoeAiBillingOperationId({supplied:original,purpose,projectId:buildProjectId})}:${purpose}`);
 }catch(error){if(error instanceof ZoeAiOperationIdentityError)return reply({ok:false,code:"AI_ATTEMPT_ID_INVALID"},400);throw error;}
 try{
  const allowed=await rateLimit(`zoebuild-attempt-audit:${access.userId}:${buildProjectId}`,{
    bucket:"zoebuild-attempt-audit",limit:36,window:"1 h"}).catch(()=>null);
  if(!allowed)return reply({ok:false,code:"BUILD_SERVICE_UNAVAILABLE"},503);
  if(!allowed.ok)return reply({ok:false,code:"BUILD_RATE_LIMITED"},429);
  const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
  if(!project)return reply({ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
  const reservations=await prisma.aiCreditReservation.findMany({
    where:{userId:access.userId,idempotencyKey:{in:keys}},select:{status:true},take:3,
  });
  // Absence does NOT establish that an in-flight request or unmetered model
  // call never happened. A terminal set does not recover the original output.
  const state=reservations.some(row=>row.status==="reserved")?"held":
    reservations.length>0?"terminal":"unrecorded";
  return reply({ok:true,state});
 }catch(error){
  if(error instanceof BuildAccessError)return reply({ok:false,code:error.code},403);
  console.error("[ZoeBuild attempt audit] read failed",{code:error instanceof Error?error.name:"UnknownError"});
  return reply({ok:false,code:"AI_ATTEMPT_AUDIT_UNAVAILABLE"},503);
 }
}
