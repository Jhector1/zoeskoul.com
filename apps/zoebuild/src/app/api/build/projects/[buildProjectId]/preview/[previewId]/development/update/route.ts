import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { readDevelopmentPreviewUpdate } from "@/lib/build/reactPreviewDevelopmentGrantHttp";
import { renewOwnedDevelopmentPreviewGrant } from "@/lib/build/reactPreviewDevelopmentDurableGrantServer";
import { parseReactPreviewId } from "@/lib/build/reactPreviewServer";
import { browserError, response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { updateOwnedReactDevelopmentPreviewFromSavedSource } from
  "@/lib/build/reactPreviewDevelopmentUpdate";

export const runtime="nodejs";
export const dynamic="force-dynamic";

/** DB-authoritative revision, optionally with a durable read grant to renew
 * after the update. No source bytes or mutation capability accepted. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}) {
  const requestId=crypto.randomUUID();
  if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED!=="true")
    return response(requestId,{ok:false,code:"BUILD_PREVIEW_NOT_FOUND"},404);
  if(!enforceSameOriginPost(req))
    return response(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
  try {
    const {sourceVersion,grantToken}=await readDevelopmentPreviewUpdate(req);
    // A combined renewal must use the same authoritative session boundary
    // as the standalone renewal route, not merely cached editor access.
    const access=grantToken
      ? await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true})
      : await loadCurrentBuildAccessSnapshot();
    if(!access.userId) return response(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    const {buildProjectId,previewId}=await ctx.params;
    const result=await updateOwnedReactDevelopmentPreviewFromSavedSource({
      access,buildProjectId,previewId,sourceVersion,
    });
    if (!grantToken) return response(requestId,{ok:true,action:result.action,sourceVersion:result.sourceVersion});
    // The mutation has already been acknowledged. A failed post-write grant
    // renewal MUST NOT become a retryable update error. The browser fences
    // its document and reconciles via the existing authenticated read lane.
    let grantRenewed=false;
    if (result.action === "updated" && result.sourceVersion === sourceVersion) {
      try {
        const renewalAccess=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});
        if (renewalAccess.userId !== access.userId) throw new Error("Preview session changed.");
        await renewOwnedDevelopmentPreviewGrant({access:renewalAccess,buildProjectId,
          previewId:parseReactPreviewId(previewId),sourceVersion,token:grantToken});
        grantRenewed=true;
      } catch { /* No token, private error or false readiness escapes. */ }
    }
    return response(requestId,{ok:true,action:result.action,sourceVersion:result.sourceVersion,grantRenewed});
  } catch(error) {return browserError(requestId,error);}
}
