import "server-only";
import { requireOwnedReactPreviewProject, ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { proxyFetchTrustedReactDevelopmentPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";
import { checkDurablePreviewGrant, renewDurablePreviewGrant, revokeDurablePreviewGrants } from "./reactPreviewDevelopmentDurableGrant";
import type { DurablePreviewGrantIdentity } from "./reactPreviewDevelopmentDurableGrant";

type Access=Parameters<typeof requireOwnedReactPreviewProject>[0]["access"];
function available() {
 if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_BROWSER_READ_ENABLED!=="true" ||
     process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_DURABLE_GRANT_ENABLED!=="true" ||
     process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED!=="true")
   throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
}
function enforceRevision(sourceVersion:number, actual:number) {
 if (!Number.isSafeInteger(sourceVersion)||sourceVersion<1||actual!==sourceVersion)
   throw new ReactPreviewRequestError("BUILD_PREVIEW_SOURCE_CONFLICT","Preview source is stale.",409);
}
export async function renewOwnedDevelopmentPreviewGrant(input:Readonly<{
 access:Access; buildProjectId:string;previewId:string;sourceVersion:number;token:string;
}>):Promise<void> {
 available();
 if (!input.access.userId) throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED","Unauthorized.",401);
 const identity:DurablePreviewGrantIdentity={userId:input.access.userId,
   buildProjectId:input.buildProjectId,previewId:input.previewId,sourceVersion:input.sourceVersion};
 const project=await requireOwnedReactPreviewProject({access:input.access,buildProjectId:input.buildProjectId});
 enforceRevision(input.sourceVersion,project.sourceVersion);
 await checkDurablePreviewGrant(input.token,identity);
 // HEAD validates the current, independently fenced Runner lease. Renewal
 // must not extend grants for missing or quarantined/behind Runner instances.
 const actorKey=await requireRunnerActorKey(input.access.userId);
 const result=await proxyFetchTrustedReactDevelopmentPreviewAtRunner({
   actorKey,buildProjectId:input.buildProjectId,previewId:input.previewId,
   sourceVersion:input.sourceVersion,path:"",method:"HEAD",accept:"*/*",
 });
 if(result.sourceVersion!==input.sourceVersion || result.response.status<200 || result.response.status>=400)
   throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND","Preview unavailable.",404);
 const after=await requireOwnedReactPreviewProject({access:input.access,buildProjectId:input.buildProjectId});
 enforceRevision(input.sourceVersion,after.sourceVersion);
 await renewDurablePreviewGrant(input.token,identity);
 // Even after the atomic DB update, a concurrent source switch must be
 // rejected. Subsequent reads independently recheck DB and Runner again.
 const latest=await requireOwnedReactPreviewProject({access:input.access,buildProjectId:input.buildProjectId});
 enforceRevision(input.sourceVersion,latest.sourceVersion);
}
export async function revokeOwnedDevelopmentPreviewGrants(input:Readonly<{
 access:Access;buildProjectId:string;previewId:string;
}>):Promise<void> {
 available();
 if(!input.access.userId)throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED","Unauthorized.",401);
 await requireOwnedReactPreviewProject({access:input.access,buildProjectId:input.buildProjectId});
 await revokeDurablePreviewGrants({userId:input.access.userId,
   buildProjectId:input.buildProjectId,previewId:input.previewId});
}
