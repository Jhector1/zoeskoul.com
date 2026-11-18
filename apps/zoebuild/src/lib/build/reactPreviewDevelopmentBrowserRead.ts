import "server-only";
import { requireOwnedReactPreviewProject, ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { proxyFetchTrustedReactDevelopmentPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";
import { verifyDevelopmentPreviewReadToken, issueDevelopmentPreviewReadToken } from "@/lib/build/reactPreviewDevelopmentReadToken";
import { publicDevelopmentPreviewBasePath, prepareDevelopmentPreviewBrowserResponse } from "@/lib/build/reactPreviewDevelopmentContentPolicy";

function enabled():boolean {
  return process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED==="true";
}
function key():string {
  const secret=process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_KEY;
  if(!secret)throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE","Preview unavailable.",503);
  return secret;
}

/** Only a freshly authenticated editor session can mint a browser-read grant.
 * It binds to current DB ownership + revision; no internal Runner URL or Vite
 * capability is disclosed. The subsequent GET requires the same DB checks. */
export async function issueOwnedDevelopmentPreviewBrowserRead(input:Readonly<{
  access:Parameters<typeof requireOwnedReactPreviewProject>[0]["access"];
  buildProjectId:string;previewId:string;sourceVersion:number;
}>) {
  if(!enabled())throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  if(!input.access.userId)throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED","Unauthorized.",401);
  const project=await requireOwnedReactPreviewProject({access:input.access,buildProjectId:input.buildProjectId});
  if(!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion<1 || project.sourceVersion!==input.sourceVersion)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_SOURCE_CONFLICT","Preview source is stale.",409);
  const durable = process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED === "true";
  if (durable && process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED !== "true")
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE","Preview unavailable.",503);
  const identity={userId:input.access.userId,buildProjectId:input.buildProjectId,
    previewId:input.previewId,sourceVersion:input.sourceVersion};
  const token=durable
    ? await (await import("./reactPreviewDevelopmentDurableGrant")).createDurablePreviewGrant(identity)
    : issueDevelopmentPreviewReadToken(identity,key());
  const basePath=publicDevelopmentPreviewBasePath(input.buildProjectId,input.previewId,token);
  return {basePath,documentUrl:basePath};
}

/** Token-bound GET/HEAD. The sandbox iframe has no access to editor cookies,
 * so each asset is checked against current DB ownership/revision and the
 * Runner's independently fenced development lease. */
export async function readOwnedDevelopmentPreviewBrowserContent(input:Readonly<{
  token:string;buildProjectId:string;previewId:string;path:string;
  method:"GET"|"HEAD";accept:"*/*"|"text/css";
}>):Promise<Response> {
  const started=Date.now();
  let stage="feature_gate";
  try {
  if(!enabled())throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  stage="grant_mode";
  const durable = input.token.startsWith("dpg1.");
  if (durable && (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED !== "true" ||
      process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED !== "true"))
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  stage="grant_lookup";
  const grantStore=durable ? await import("./reactPreviewDevelopmentDurableGrant") : null;
  const grant=grantStore ? await grantStore.lookupDurablePreviewGrant(input.token) : null;
  stage="grant_claims";
  const claims=grant ? {userId:grant.userId,buildProjectId:grant.buildProjectId,
    previewId:grant.previewId,sourceVersion:grant.sourceVersionFloor}
    : verifyDevelopmentPreviewReadToken(input.token,key());
  stage="grant_identity";
  if(claims.buildProjectId!==input.buildProjectId || claims.previewId!==input.previewId)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  stage="project_ownership";
  const project=await requireOwnedReactPreviewProject({
    access:{userId:claims.userId,entitlements:[]},buildProjectId:claims.buildProjectId,
  });
  // Optional read-only lease grant: its original revision is a lower bound,
  // NEVER permission to read an older source or another preview. A current
  // owner check and exact Runner lease revision check are still required.
  // Off by default; normal revision-bound tokens remain unchanged.
  const liveRead = process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED === "true";
  stage="revision_fence";
  const activeRevision = project.sourceVersion;
  if (activeRevision !== claims.sourceVersion &&
      (!liveRead || !Number.isSafeInteger(activeRevision) || activeRevision < claims.sourceVersion))
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  stage="grant_preflight";
  if(grantStore) await grantStore.checkDurablePreviewGrant(input.token,{
    userId:claims.userId,buildProjectId:claims.buildProjectId,previewId:claims.previewId,
    sourceVersion:activeRevision,
  });
  stage="runner_actor";
  const actorKey=await requireRunnerActorKey(claims.userId);
  stage="runner_fetch";
  const result=await proxyFetchTrustedReactDevelopmentPreviewAtRunner({
    actorKey,previewId:claims.previewId,buildProjectId:claims.buildProjectId,
    sourceVersion:activeRevision,path:input.path,method:input.method,accept:input.accept,
  });
  if(process.env.NODE_ENV==="development" && (input.path==="" || input.path==="/" || result.response.status>=400))
    console.info("[ZOE-PREVIEW-READ]",JSON.stringify({method:input.method,stage:"runner_response",status:result.response.status,elapsedMs:Date.now()-started}));
  stage="runner_revision";
  if(result.sourceVersion!==activeRevision)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  // The DB may change while Docker is serving a read; do not return content
  // for a previous or concurrently changed revision. Auth is rechecked too.
  stage="ownership_recheck";
  const after = await requireOwnedReactPreviewProject({
    access:{userId:claims.userId,entitlements:[]},buildProjectId:claims.buildProjectId,
  });
  if (after.sourceVersion !== activeRevision)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
  // Revocation, expiry or loss of ownership during an in-flight Docker read
  // must not return a successful response.
  stage="grant_recheck";
  if(grantStore) await grantStore.checkDurablePreviewGrant(input.token,{
    userId:claims.userId,buildProjectId:claims.buildProjectId,previewId:claims.previewId,
    sourceVersion:activeRevision,
  });
  stage="response_policy";
  const publicBase=publicDevelopmentPreviewBasePath(claims.buildProjectId,claims.previewId,input.token);
  return await prepareDevelopmentPreviewBrowserResponse(result.response,publicBase,input.method,
    durable && process.env.ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED === "true" &&
    process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED === "true");
  } catch(error) {
    if(process.env.NODE_ENV==="development") {
      const status=error instanceof ReactPreviewRequestError ? error.status : null;
      console.warn("[ZOE-PREVIEW-READ]",JSON.stringify({method:input.method,stage,status,elapsedMs:Date.now()-started}));
    }
    throw error;
  }
}
