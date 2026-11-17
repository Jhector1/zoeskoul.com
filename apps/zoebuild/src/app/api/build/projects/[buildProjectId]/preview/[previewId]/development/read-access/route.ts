import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { parseReactPreviewId } from "@/lib/build/reactPreviewServer";
import { readDevelopmentPreviewRevision } from "@/lib/build/reactPreviewDevelopmentHttp";
import { browserError,response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { issueOwnedDevelopmentPreviewBrowserRead } from "@/lib/build/reactPreviewDevelopmentBrowserRead";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** The editor session is needed ONLY to mint a short-lived read-only grant. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}) {
 const requestId=crypto.randomUUID();
 if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED!=="true")
   return response(requestId,{ok:false,code:"BUILD_PREVIEW_NOT_FOUND"},404);
 if(!enforceSameOriginPost(req))return response(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
 try {
  const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
  if(!access.userId)return response(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
  const sourceVersion=await readDevelopmentPreviewRevision(req);
  const {buildProjectId,previewId:untrusted}=await ctx.params;
  const previewId=parseReactPreviewId(untrusted);
  const {documentUrl,basePath}=await issueOwnedDevelopmentPreviewBrowserRead({access,buildProjectId,previewId,sourceVersion});
  return response(requestId,{ok:true,documentUrl,basePath,sourceVersion});
 } catch(error) {return browserError(requestId,error);}
}
