import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { parseReactPreviewId } from "@/lib/build/reactPreviewServer";
import { readDevelopmentPreviewRevision } from "@/lib/build/reactPreviewDevelopmentHttp";
import { browserError, response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { startOwnedReactDevelopmentPreviewFromSavedSource } from
  "@/lib/build/reactPreviewDevelopmentStart";

export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Phase 4E1 experiment. Never returns capability/basePath, and does NOT
 * connect the browser iframe to the mutable lease. No UI calls this yet. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string}>}) {
  const requestId=crypto.randomUUID();
  if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED!=="true")
    return response(requestId,{ok:false,code:"BUILD_PREVIEW_NOT_FOUND"},404);
  if(!enforceSameOriginPost(req))
    return response(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
  try {
    const access=await loadCurrentBuildAccessSnapshot();
    if(!access.userId) return response(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    const sourceVersion=await readDevelopmentPreviewRevision(req);
    const {buildProjectId}=await ctx.params;
    const preview=await startOwnedReactDevelopmentPreviewFromSavedSource({
      access,buildProjectId,sourceVersion,requestId,
    });
    // Runner responses are treated as untrusted. Never return a capability
    // token, Docker network location, or arbitrary URL to a browser.
    const previewId=parseReactPreviewId(preview.previewId);
    if(preview.buildProjectId!==buildProjectId || preview.sourceVersion!==sourceVersion) {
      console.warn("ZOEBUILD development preview start failed", {
        requestId,stage:"runner_response_validation",
        category:"invalid_runner_response",status:null,
      });
      throw new Error("Runner preview identity mismatch.");
    }
    return response(requestId,{ok:true,previewId,sourceVersion});
  } catch(error) {return browserError(requestId,error);}
}
