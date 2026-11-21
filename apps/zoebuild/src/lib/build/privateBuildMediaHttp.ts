import {MediaHttpError} from "./privateMediaTransport";
export {MediaHttpError,publicMediaMetadata,readPrivateMediaUpload} from "./privateMediaTransport";
/** Shared, server-authorized private media HTTP boundary. Never returns R2 keys. */
import {NextResponse} from "next/server";
import {BuildMediaStorageError, authorizeBuildMediaOwner} from "@zoeskoul/build-application";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {createPrismaBuildMediaCatalog} from "@/lib/build/prismaBuildMediaCatalog";
import {rateLimit} from "@zoeskoul/platform-server/security/ratelimit";
import {BuildMediaContractError} from "@zoeskoul/build-application";

export function mediaJson(requestId:string, body:Record<string,unknown>, status=200):NextResponse {
  const r=NextResponse.json({...body,requestId},{status});
  r.headers.set("Cache-Control","private, no-store, max-age=0");
  r.headers.set("X-Content-Type-Options","nosniff");
  r.headers.set("X-Request-Id",requestId);
  return r;
}

export async function requirePrivateMediaProject(req:Request,buildProjectId:string) {
  let access:Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
  try { access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true}); }
  catch {throw new MediaHttpError(503,"SESSION_AUTHORITY_UNAVAILABLE");}
  if (!access.userId)throw new MediaHttpError(401,"BUILD_AUTH_REQUIRED");
  const bound=createPrismaBuildMediaCatalog();
  try {
    const scope=await authorizeBuildMediaOwner({
      actorUserId:access.userId,buildProjectId,ownership:bound.ownership,
    });
    return {scope,bound,userId:access.userId};
  } catch(error) {
    if(error instanceof BuildMediaStorageError && error.code==="BUILD_MEDIA_ACCESS_DENIED")
      throw new MediaHttpError(404,"BUILD_MEDIA_NOT_FOUND");
    throw error;
  }
}

/** Limit private R2 reads and catalog pagination independently of uploads. */
export async function requirePrivateMediaReadBudget(userId:string,buildProjectId:string):Promise<void> {
  const result=await rateLimit(`zoebuild-media-read:${userId}:${buildProjectId}`,{
    bucket:"zoebuild-media-read",limit:1500,window:"1 h",
  }).catch(()=>null);
  if(!result)throw new MediaHttpError(503,"BUILD_MEDIA_RATE_LIMIT_UNAVAILABLE");
  if(!result.ok)throw new MediaHttpError(429,"BUILD_MEDIA_RATE_LIMITED");
}

export function handleMediaError(requestId:string,error:unknown):NextResponse {
  if(error instanceof MediaHttpError)
    return mediaJson(requestId,{ok:false,code:error.code,message:"Media request could not be completed."},error.status);
  if(error instanceof BuildMediaContractError) {
    if(["BUILD_MEDIA_ASSET_ID_INVALID","BUILD_MEDIA_PROJECT_INVALID",
      "BUILD_MEDIA_OWNER_INVALID","BUILD_MEDIA_SCOPE_MISMATCH"].includes(error.code))
      return mediaJson(requestId,{ok:false,code:"BUILD_MEDIA_NOT_FOUND",message:"Media not found."},404);
    return mediaJson(requestId,{ok:false,code:"BUILD_MEDIA_INPUT_INVALID",message:"Invalid media input."},400);
  }
  if(error instanceof BuildMediaStorageError) {
    if(error.code==="BUILD_MEDIA_ACCESS_DENIED")
      return mediaJson(requestId,{ok:false,code:"BUILD_MEDIA_NOT_FOUND",message:"Media not found."},404);
    if(["BUILD_MEDIA_SIZE_INVALID","BUILD_MEDIA_IMAGE_DECODE_INVALID","BUILD_MEDIA_SIGNATURE_INVALID",
      "BUILD_MEDIA_CURSOR_INVALID"].includes(error.code))
      return mediaJson(requestId,{ok:false,code:error.code,message:"Invalid media input."},400);
  }
  // Do not log raw upstream errors (some contain credentials or signed URLs).
  console.error("[zoebuild private media] operation unavailable",{requestId,
    className:error instanceof Error ? error.name : "UnknownError"});
  return mediaJson(requestId,{ok:false,code:"BUILD_MEDIA_UNAVAILABLE",message:"Media service unavailable."},503);
}
