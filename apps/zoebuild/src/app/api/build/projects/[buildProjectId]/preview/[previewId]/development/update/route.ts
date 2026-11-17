import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { readDevelopmentPreviewRevision } from "@/lib/build/reactPreviewDevelopmentHttp";
import { browserError, response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { updateOwnedReactDevelopmentPreviewFromSavedSource } from
  "@/lib/build/reactPreviewDevelopmentUpdate";

export const runtime="nodejs";
export const dynamic="force-dynamic";

/** Phase 4E1: DB-authoritative revision only, NOT source bytes or an update
 * capability. Existing immutable /sync remains unchanged. Browser HMR is
 * still disconnected pending a separately authenticated transport. */
export async function POST(req:Request,ctx:{params:Promise<{buildProjectId:string;previewId:string}>}) {
  const requestId=crypto.randomUUID();
  if(process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_WEB_ENABLED!=="true")
    return response(requestId,{ok:false,code:"BUILD_PREVIEW_NOT_FOUND"},404);
  if(!enforceSameOriginPost(req))
    return response(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
  try {
    const access=await loadCurrentBuildAccessSnapshot();
    if(!access.userId) return response(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    const sourceVersion=await readDevelopmentPreviewRevision(req);
    const {buildProjectId,previewId}=await ctx.params;
    const result=await updateOwnedReactDevelopmentPreviewFromSavedSource({
      access,buildProjectId,previewId,sourceVersion,
    });
    return response(requestId,{ok:true,action:result.action,sourceVersion:result.sourceVersion});
  } catch(error) {return browserError(requestId,error);}
}
