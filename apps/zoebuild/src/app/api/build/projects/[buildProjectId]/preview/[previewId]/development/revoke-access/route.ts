import {enforceSameOriginPost} from "@zoeskoul/platform-server/http";
import {loadCurrentBuildAccessSnapshot} from "@/lib/build/currentBuildAccess";
import {parseReactPreviewId} from "@/lib/build/reactPreviewServer";
import {browserError,response} from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import {revokeOwnedDevelopmentPreviewGrants} from "@/lib/build/reactPreviewDevelopmentDurableGrantServer";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}) {
 const id=crypto.randomUUID();
 if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED!=="true")
  return response(id,{ok:false,code:"BUILD_PREVIEW_NOT_FOUND"},404);
 if(!enforceSameOriginPost(req))return response(id,{ok:false,code:"BUILD_FORBIDDEN"},403);
 // Revocation does not accept source files, actor credentials or other input.
 if(req.body || (req.headers.get("content-length") && req.headers.get("content-length")!=="0"))
  return response(id,{ok:false,code:"BUILD_PREVIEW_INVALID"},400);
 try {
  const access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
  if(!access.userId)return response(id,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
  const {buildProjectId,previewId:raw}=await ctx.params;
  await revokeOwnedDevelopmentPreviewGrants({access,buildProjectId,previewId:parseReactPreviewId(raw)});
  return response(id,{ok:true});
 } catch(error) {return browserError(id,error);}
}
