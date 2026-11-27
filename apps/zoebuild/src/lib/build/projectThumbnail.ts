import "server-only";
import { PROJECT_THUMBNAIL_MAX_BYTES, assertProjectThumbnailJpeg } from "@zoeskoul/build-executor-contracts";
import { createHash } from "node:crypto";
import { runnerPost } from "@zoeskoul/platform-server/server/runnerClient";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { ReactPreviewRequestError } from "./reactPreviewServer";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { createZoeBuildPrivateR2ThumbnailStore } from "./cloudflareR2MediaServer";
import { loadCurrentBuildAccessSnapshot } from "./currentBuildAccess";

type Scope=Readonly<{userId:string;buildProjectId:string;sourceVersion:number}>;
const MAX_BYTES=PROJECT_THUMBNAIL_MAX_BYTES;
const pending=new Set<string>();
export function projectThumbnailEnabled(){return process.env.ZOEBUILD_PROJECT_THUMBNAILS_ENABLED==="true";}
export function thumbnailKey(scope:Scope){
  if(!scope.userId||! /^[A-Za-z0-9_-]{4,128}$/.test(scope.buildProjectId)||!Number.isSafeInteger(scope.sourceVersion)||scope.sourceVersion<1)throw new Error("Invalid thumbnail scope.");
  const owner=createHash("sha256").update(scope.userId).digest("hex");
  return `project-thumbnails/${owner}/${scope.buildProjectId}/${scope.sourceVersion}/homepage-v1`;
}
async function authorize(req:Request,buildProjectId:string,sourceVersion:number):Promise<Scope>{
  const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
  if(!access.userId)throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED","Unauthorized.",401);
  // Same owner and archive predicates as the project list; no workspace or media hydration.
  const project=await prisma.buildProject.findFirst({where:{id:buildProjectId,status:{not:"archived"},stackId:"tanstack-start-v1",codeProject:{ownerId:access.userId,archivedAt:null}},select:{codeProject:{select:{currentVersion:true}}}});
  if(!project)throw new ReactPreviewRequestError("BUILD_PROJECT_NOT_FOUND","Project not found.",404);
  if(project.codeProject.currentVersion!==sourceVersion)throw new ReactPreviewRequestError("BUILD_PREVIEW_SOURCE_CONFLICT","Saved source has changed.",409);
  return {userId:access.userId,buildProjectId,sourceVersion};
}
export async function readProjectThumbnail(req:Request,buildProjectId:string,sourceVersion:number){
  const scope=await authorize(req,buildProjectId,sourceVersion);
  const bytes=await createZoeBuildPrivateR2ThumbnailStore().read(thumbnailKey(scope));
  const after=await authorize(req,buildProjectId,sourceVersion);
  if(after.userId!==scope.userId)throw new Error("Thumbnail unavailable.");
  return bytes?assertProjectThumbnailJpeg(bytes):null;
}
/** Dashboard-only fallback: check the current saved revision and at most three older ones.
 * Never authorize an old version directly; recheck the current owner/revision before returning.
 */
export async function readProjectThumbnailDisplay(req:Request,buildProjectId:string,sourceVersion:number){
  const scope=await authorize(req,buildProjectId,sourceVersion);
  const store=createZoeBuildPrivateR2ThumbnailStore();
  for(let version=sourceVersion;version>=Math.max(1,sourceVersion-3);version--){
    const bytes=await store.read(thumbnailKey({...scope,sourceVersion:version}));
    if(!bytes)continue;
    const after=await authorize(req,buildProjectId,sourceVersion);
    if(after.userId!==scope.userId)throw new Error("Thumbnail unavailable.");
    return {bytes:assertProjectThumbnailJpeg(bytes),version,capturing:pending.has(thumbnailKey(scope))};
  }
  const after=await authorize(req,buildProjectId,sourceVersion);
  if(after.userId!==scope.userId)throw new Error("Thumbnail unavailable.");
  return {bytes:null,version:null,capturing:pending.has(thumbnailKey(scope))};
}
/** Automatic capture is immutable; explicit refresh replaces only a validated current-revision JPEG. */
export async function captureProjectThumbnail(req:Request,buildProjectId:string,previewId:string,sourceVersion:number,refresh=false){
  let stage="authorize";
  const started=Date.now();
  try {
    stage="authorize";
    const scope=await authorize(req,buildProjectId,sourceVersion);
    const key=thumbnailKey(scope);
    stage="single-flight";
    if(pending.size>0)throw new ReactPreviewRequestError("BUILD_THUMBNAIL_BUSY","Thumbnail capture busy.",503);
    pending.add(key);
    try{
      stage="r2-config";
      const store=createZoeBuildPrivateR2ThumbnailStore();
      stage="r2-read";
      const existing=await store.read(key);
      if(existing&&!refresh){stage="cache-validation";assertProjectThumbnailJpeg(existing);return;}
      stage="actor-key";
      const actorKey=await requireRunnerActorKey(scope.userId);
      stage="runner-capture";
      const result=await runnerPost<{ok:true;sourceVersion:number;bodyBase64:string}>(
        `/build/previews/${encodeURIComponent(previewId)}/thumbnail`,actorKey,{buildProjectId,sourceVersion});
      stage="jpeg-validation";
      if(result?.ok!==true||result.sourceVersion!==sourceVersion||typeof result.bodyBase64!=="string"||result.bodyBase64.length>Math.ceil(MAX_BYTES/3)*4)throw new Error("Invalid capture.");
      const bytes=Buffer.from(result.bodyBase64,"base64");
      if(bytes.toString("base64")!==result.bodyBase64)throw new Error("Invalid capture.");
      assertProjectThumbnailJpeg(bytes);
      stage="revision-recheck";
      const after=await authorize(req,buildProjectId,sourceVersion);
      if(after.userId!==scope.userId)throw new Error("Thumbnail unavailable.");
      stage="r2-write";
      const upload={key,bytes,mimeType:"image/jpeg",sha256:createHash("sha256").update(bytes).digest("hex")};
      if(refresh){await store.replace(upload);return;}
      const outcome=await store.putIfAbsent(upload);
      if(outcome==="already-exists"){
        stage="r2-winner-read";
        const winner=await store.read(key);
        if(!winner)throw new Error("Thumbnail unavailable.");
        assertProjectThumbnailJpeg(winner);
      }
    }finally{pending.delete(key);}
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const e=error && typeof error === "object" ? error as {code?:unknown;status?:unknown;message?:unknown} : {};
      const allowed=new Set([
        "ENOENT","EACCES","ELOOP","EPERM","THUMBNAIL_UNAVAILABLE",
        "BUILD_MEDIA_R2_SECRET_FILE_UNSAFE","BUILD_MEDIA_R2_SECRET_FILE_INVALID",
        "BUILD_MEDIA_R2_CONFIG_INVALID","BUILD_MEDIA_R2_KEY_INVALID","BUILD_MEDIA_R2_TIMEOUT_INVALID",
        "BUILD_MEDIA_R2_CLOCK_INVALID","BUILD_MEDIA_R2_NETWORK_UNAVAILABLE","BUILD_MEDIA_R2_UPLOAD_INVALID",
        "BUILD_MEDIA_R2_UPLOAD_DIGEST_MISMATCH","BUILD_MEDIA_R2_WRITE_FAILED","BUILD_MEDIA_R2_READ_FAILED",
        "BUILD_MEDIA_R2_READ_TOO_LARGE","BUILD_MEDIA_R2_READ_EMPTY","BUILD_THUMBNAIL_BUSY",
        "BUILD_AUTH_REQUIRED","BUILD_PROJECT_NOT_FOUND","BUILD_PREVIEW_SOURCE_CONFLICT",
      ]);
      const code=typeof e.code==="string"&&allowed.has(e.code)?e.code:
        typeof e.message==="string"&&allowed.has(e.message)?e.message:"UNCLASSIFIED";
      const status=typeof e.status==="number"&&Number.isInteger(e.status)&&e.status>=100&&e.status<=599?e.status:null;
      console.warn("[ZOE-THUMBNAIL-DIAG]",JSON.stringify({stage,code,status,elapsedMs:Date.now()-started}));
    }
    throw error;
  }
}
