/** AI4B4A: owner-scoped image listing and private, server-validated PNG uploads. */
import {ingestPrivateBuildMediaImage} from "@zoeskoul/build-application";
import {enforceSameOriginPost,exceedsContentLength} from "@zoeskoul/platform-server/http";
import {rateLimit} from "@zoeskoul/platform-server/security/ratelimit";
import {createZoeBuildPrivateR2ObjectStore} from "@/lib/build/cloudflareR2MediaServer";
import {privatePngInspector} from "@/lib/build/privatePngInspector";
import {handleMediaError,mediaJson,MediaHttpError,publicMediaMetadata,
  readPrivateMediaUpload,requirePrivateMediaProject,requirePrivateMediaReadBudget} from "@/lib/build/privateBuildMediaHttp";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const MAX_UPLOAD_BYTES=20*1024*1024;
type Params={params:Promise<{buildProjectId:string}>};

async function limited(userId:string,buildProjectId:string) {
  const result=await rateLimit(`zoebuild-media-upload:${userId}:${buildProjectId}`,{
    bucket:"zoebuild-media-upload",limit:30,window:"1 h",
  }).catch(()=>null);
  if(!result)throw new MediaHttpError(503,"BUILD_MEDIA_RATE_LIMIT_UNAVAILABLE");
  if(!result.ok)throw new MediaHttpError(429,"BUILD_MEDIA_RATE_LIMITED");
}

export async function GET(req:Request,ctx:Params) {
  const requestId=crypto.randomUUID();
  try {
    const {buildProjectId}=await ctx.params;
    const {scope,bound,userId}=await requirePrivateMediaProject(req,buildProjectId);
    await requirePrivateMediaReadBudget(userId,scope.buildProjectId);
    const url=new URL(req.url);
    if([...url.searchParams.keys()].some(k=>k!=="cursor"))
      throw new MediaHttpError(400,"BUILD_MEDIA_QUERY_INVALID");
    const cursor=url.searchParams.get("cursor");
    const page=await bound.list(scope,cursor);
    return mediaJson(requestId,{ok:true,
      items:page.items.map(asset=>publicMediaMetadata(asset,scope.buildProjectId)),
      nextCursor:page.nextCursor});
  } catch(error){return handleMediaError(requestId,error);}
}

export async function POST(req:Request,ctx:Params) {
  const requestId=crypto.randomUUID();
  try {
    if(!enforceSameOriginPost(req))throw new MediaHttpError(403,"BUILD_FORBIDDEN");
    if(exceedsContentLength(req,MAX_UPLOAD_BYTES))
      throw new MediaHttpError(413,"BUILD_MEDIA_REQUEST_TOO_LARGE");
    if(req.headers.get("content-type")!=="image/png")
      throw new MediaHttpError(415,"BUILD_MEDIA_UPLOAD_TYPE_UNSUPPORTED");
    const {buildProjectId}=await ctx.params;
    const {scope,bound,userId}=await requirePrivateMediaProject(req,buildProjectId);
    await limited(userId,scope.buildProjectId);
    const bytes=await readPrivateMediaUpload(req);
    const id=`asset_${crypto.randomUUID().replaceAll("-","")}`;
    const asset=await ingestPrivateBuildMediaImage({
      actorUserId:userId,buildProjectId:scope.buildProjectId,ownership:bound.ownership,
      assetId:id,origin:"uploaded",providerId:null,modelId:null,
      bytes,altText:null,inspector:privatePngInspector,
      store:createZoeBuildPrivateR2ObjectStore(),catalog:bound.catalog,
    });
    return mediaJson(requestId,{ok:true,asset:publicMediaMetadata(asset,scope.buildProjectId)},201);
  } catch(error){return handleMediaError(requestId,error);}
}
