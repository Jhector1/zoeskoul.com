import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { parseReactPreviewId } from "@/lib/build/reactPreviewServer";
import { readDevelopmentPreviewRevision } from "@/lib/build/reactPreviewDevelopmentHttp";
import { browserError,response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { captureProjectThumbnail,projectThumbnailEnabled } from "@/lib/build/projectThumbnail";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}){
  const id=crypto.randomUUID();
  if(!projectThumbnailEnabled())return response(id,{ok:false},404);
  if(!enforceSameOriginPost(req))return response(id,{ok:false},403);
  try{
    const {buildProjectId,previewId}=await ctx.params;
    const version=await readDevelopmentPreviewRevision(req);
    // Explicit opt-in query; body and authorization boundary remain unchanged.
    const refresh=new URL(req.url).searchParams.get("refresh")==="1";
    await captureProjectThumbnail(req,buildProjectId,parseReactPreviewId(previewId),version,refresh);
    return response(id,{ok:true,sourceVersion:version});
  }catch(error){return browserError(id,error);}
}
