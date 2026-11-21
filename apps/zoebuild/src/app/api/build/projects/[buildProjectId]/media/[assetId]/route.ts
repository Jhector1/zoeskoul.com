/** AI4B4A: authenticated, integrity-checked private media bytes. No signed/public URLs. */
import {readPrivateBuildMediaImage} from "@zoeskoul/build-application";
import {createZoeBuildPrivateR2ObjectStore} from "@/lib/build/cloudflareR2MediaServer";
import {handleMediaError,mediaJson,requirePrivateMediaProject,requirePrivateMediaReadBudget} from "@/lib/build/privateBuildMediaHttp";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{buildProjectId:string;assetId:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    const {buildProjectId,assetId}=await ctx.params;
    const {scope,bound,userId}=await requirePrivateMediaProject(req,buildProjectId);
    await requirePrivateMediaReadBudget(userId,scope.buildProjectId);
    const image=await readPrivateBuildMediaImage({
      actorUserId:userId,buildProjectId:scope.buildProjectId,ownership:bound.ownership,
      assetId,catalog:bound.catalog,store:createZoeBuildPrivateR2ObjectStore(),
    });
    if(!image)return mediaJson(requestId,{ok:false,code:"BUILD_MEDIA_NOT_FOUND"},404);
    const data=new ArrayBuffer(image.bytes.byteLength);
    new Uint8Array(data).set(image.bytes);
    const extension={"image/png":"png","image/jpeg":"jpg","image/webp":"webp",
      "image/avif":"avif"}[image.asset.mimeType] ?? "bin";
    return new Response(data,{status:200,headers:{
      "Content-Type":image.asset.mimeType,
      "Content-Length":String(image.bytes.byteLength),
      "Content-Disposition":`inline; filename="${image.asset.id}.${extension}"`,
      "Cache-Control":"private, no-store, max-age=0",
      "X-Content-Type-Options":"nosniff",
      "Content-Security-Policy":"default-src 'none'; sandbox",
      "X-Request-Id":requestId,
    }});
  } catch(error){return handleMediaError(requestId,error);}
}
