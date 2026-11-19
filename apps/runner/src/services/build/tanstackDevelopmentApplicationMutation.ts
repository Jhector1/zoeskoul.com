import { sharedFullStackPreviews, type SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
import { normalizeTanstackPreviewHttpRequest, normalizeTanstackPreviewHttpResponse,
  TANSTACK_JSON_POST_RPC, TANSTACK_RPC_MUTATION_ADMISSION_MS } from "./tanstackPreviewHttpBoundary.js";
import { DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER } from "./tanstackDevelopmentPreviewRead.js";
import { tanstackInternalPreviewPath } from "./tanstackPreviewRuntimePolicy.js";

/** Separate application mutation admission, never called by a browser read grant.
 * Hold the existing exclusive lease slot until the response is validated.
 * An uncertain operation is never replayed, even after the caller deadline. */
export async function executeOwnedTanstackDevelopmentMutation(input: Readonly<{
  ownerKey:string; previewId:string; buildProjectId:string; sourceVersion:number;
  path:string; bodyBase64:string;
}>, deps: Readonly<{
  registry: Pick<SharedFullStackPreviewRegistry,"assertDevelopmentReadOpen"|"withDevelopmentUpdate"|
    "assertDevelopmentUpdateOpen"|"quarantineDevelopmentUpdate"|"close"|"touch">;
  transport:typeof fetchTanstackHttpInsideSandbox;
}> = {registry:sharedFullStackPreviews,transport:fetchTanstackHttpInsideSandbox}) {
  const identity={ownerKey:input.ownerKey,previewId:input.previewId,buildProjectId:input.buildProjectId,sourceVersion:input.sourceVersion};
  // No await between the exact read check and acquiring the exclusive slot.
  const initial=deps.registry.assertDevelopmentReadOpen(identity);
  const request=normalizeTanstackPreviewHttpRequest({basePath:initial.basePath,path:initial.basePath+input.path,
    method:"POST",headers:{accept:"*/*","content-type":"application/json"},bodyBase64:input.bodyBase64,
    applicationRpc:TANSTACK_JSON_POST_RPC,mutationDeadlineMs:Date.now()+TANSTACK_RPC_MUTATION_ADMISSION_MS});
  const internalPath=tanstackInternalPreviewPath(initial.basePath,request);
  let uncertain=false;
  try {
    return await deps.registry.withDevelopmentUpdate(input.previewId,async lease=>{
      if(lease.ownerKey!==input.ownerKey || lease.buildProjectId!==input.buildProjectId ||
        lease.containerId!==initial.containerId || lease.basePath!==initial.basePath)
        throw new Error("Preview not found.");
      deps.registry.assertDevelopmentUpdateOpen(input.previewId,input.sourceVersion,initial.identity.fingerprint);
      if(Date.now()>=(request.mutationDeadlineMs??0))throw new Error("Preview mutation expired.");
      try {
        const response=await deps.transport(lease.containerId,{...request,path:internalPath});
        deps.registry.assertDevelopmentUpdateOpen(input.previewId,input.sourceVersion,initial.identity.fingerprint);
        // Independently check the bounded protocol and exact private token, including escaped strings.
        const validated=normalizeTanstackPreviewHttpResponse(response,TANSTACK_JSON_POST_RPC);
        const text=Buffer.from(validated.bodyBase64,"base64").toString("utf8");
        const canonical=JSON.stringify(JSON.parse(text));
        const token=initial.basePath.split("/").at(-2)!;
        const marker=DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1);
        if([text,canonical].some(v=>v.includes(token)||v.includes(marker)))throw new Error("Unsafe preview mutation response.");
        deps.registry.touch(input.previewId,Date.now());
        return {sourceVersion:input.sourceVersion,response:validated};
      } catch {
        // A failed dispatch or invalid reply does not prove the operation did
        // not execute. Fence first, then release the slot and retire the lease.
        uncertain=true;
        deps.registry.quarantineDevelopmentUpdate(input.previewId);
        throw new Error("Preview mutation outcome uncertain.");
      }
    });
  } finally {
    if(uncertain)await deps.registry.close(input.previewId).catch(()=>undefined);
  }
}
