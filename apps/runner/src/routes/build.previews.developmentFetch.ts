import type { Request, RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { DevelopmentPreviewRevisionTransitionError } from "../services/build/sharedPreviewRegistry.js";
import {
  normalizeDevelopmentPreviewRelativePath,
  readOwnedTanstackDevelopmentPreview,
} from "../services/build/tanstackDevelopmentPreviewRead.js";

import { executeOwnedTanstackDevelopmentMutation } from "../services/build/tanstackDevelopmentApplicationMutation.js";
import { TANSTACK_JSON_GET_RPC, TANSTACK_JSON_POST_RPC, assertTanstackJsonGetRpcPath, assertTanstackJsonPostRpcPath, assertTanstackJsonPostRpcBody } from "../services/build/tanstackPreviewHttpBoundary.js";

const ACTOR = /^u:[0-9a-f]{64}$/;
const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT = /^[A-Za-z0-9_-]{1,128}$/;
type ReadArgs = Parameters<typeof readOwnedTanstackDevelopmentPreview>[0];
type MutationArgs = Parameters<typeof executeOwnedTanstackDevelopmentMutation>[0];
type Dependencies = Readonly<{
  enabled: () => boolean;
  applicationRpcEnabled?: () => boolean;
  applicationMutationEnabled?: () => boolean;
  mutate?: typeof executeOwnedTanstackDevelopmentMutation;
  actorKey: (req:Request) => string;
  read: (input:ReadArgs) => ReturnType<typeof readOwnedTanstackDevelopmentPreview>;
}>;
const productionDeps:Dependencies = {
  enabled:()=>process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_READ_ENABLED === "true",
  applicationRpcEnabled:()=>process.env.RUNNER_EXECUTION_POOL === "zoebuild" && process.env.ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED === "true",
  applicationMutationEnabled:()=>process.env.RUNNER_EXECUTION_POOL === "zoebuild" && process.env.ZOEBUILD_DEVELOPMENT_APPLICATION_POST_ENABLED === "true",
  mutate:executeOwnedTanstackDevelopmentMutation,
  actorKey:getRequiredActorKey,
  read:readOwnedTanstackDevelopmentPreview,
};

/** Service-authenticated development endpoint, never accessible through a browser
 * capability or via the existing immutable /proxy-fetch route.
 * Global requireServiceAuth must precede this handler in app.ts.
 */
export function makeTanstackDevelopmentFetchRoute(deps:Dependencies=productionDeps):RequestHandler {
  return async (req,res) => {
    if (!deps.enabled()) return res.status(404).json({ok:false,code:"NOT_FOUND"});
    let input:ReadArgs | MutationArgs;
    try {
      const actorKey = deps.actorKey(req);
      const previewId = String(req.params.previewId ?? "");
      // Restrict the inbound command; do not forward arbitrary browser headers,
      // credentials or WebSocket headers. Only the separately gated mutation
      // protocol accepts a bounded serialized JSON body.
      const value:unknown = req.body;
      if (!value || typeof value!=="object" || Array.isArray(value))
        throw new Error("Invalid request.");
      const body=value as Record<string,unknown>;
      const rpc = body.applicationRpc === TANSTACK_JSON_GET_RPC;
      const mutation = body.applicationRpc === TANSTACK_JSON_POST_RPC;
      if(mutation && (!deps.applicationRpcEnabled?.() || !deps.applicationMutationEnabled?.() || !deps.mutate))
        return res.status(404).json({ok:false,code:"NOT_FOUND"});
      if (rpc && !deps.applicationRpcEnabled?.())
        return res.status(404).json({ok:false,code:"NOT_FOUND"});
      if (Object.keys(body).sort().join(",")!==
          (mutation ? "accept,applicationRpc,bodyBase64,buildProjectId,method,path,sourceVersion" : rpc ? "accept,applicationRpc,buildProjectId,method,path,sourceVersion" : "accept,buildProjectId,method,path,sourceVersion"))
        throw new Error("Invalid request.");
      if (!ACTOR.test(actorKey) || !PREVIEW.test(previewId) ||
          typeof body.buildProjectId !== "string" ||
          !PROJECT.test(body.buildProjectId) ||
          typeof body.path !== "string" || body.path.length > 4096 ||
          !Number.isSafeInteger(body.sourceVersion) ||
          typeof body.sourceVersion !== "number" || body.sourceVersion < 1 ||
          (mutation ? body.method!=="POST" : body.method!=="GET" && body.method!=="HEAD") ||
          (body.accept!=="*/*" && body.accept!=="text/css"))
        throw new Error("Invalid request.");
      const relativePath = normalizeDevelopmentPreviewRelativePath(body.path);
      if (rpc) {
        if (body.method !== "GET" || body.accept !== "*/*") throw new Error("Invalid RPC request.");
        assertTanstackJsonGetRpcPath(relativePath);
      }
      if(mutation){
        if(body.method!=="POST" || body.accept!=="*/*")throw new Error("Invalid mutation request.");
        assertTanstackJsonPostRpcPath(relativePath);
        const bodyBase64=assertTanstackJsonPostRpcBody(body.bodyBase64);
        input={ownerKey:actorKey,previewId,buildProjectId:body.buildProjectId,sourceVersion:body.sourceVersion,path:relativePath,bodyBase64};
      } else {
        if(body.method!=="GET" && body.method!=="HEAD")throw new Error("Invalid read method.");
      input={
        ownerKey:actorKey,previewId,buildProjectId:body.buildProjectId,
        sourceVersion:body.sourceVersion,path:relativePath,
        method:body.method,accept:body.accept, ...(rpc ? {applicationRpc:TANSTACK_JSON_GET_RPC} : {}),
      };
      }
    } catch {return res.status(400).json({ok:false,code:"INVALID_REQUEST"});}
    try {
      const result="bodyBase64" in input ? await deps.mutate!(input) : await deps.read(input);
      return res.status(200).json({ok:true,response:result.response,
        sourceVersion:result.sourceVersion});
    } catch (error) {
      // This typed fence is emitted only after the exact owner/project check.
      // It never authorizes the content and is private to the service caller.
      if (error instanceof DevelopmentPreviewRevisionTransitionError)
        return res.status(409).json({ok:false,code:"REVISION_TRANSITION"});
      // Unknown/foreign/closing/quarantined and transport errors stay opaque.
      return res.status(404).json({ok:false,code:"NOT_FOUND"});
    }
  };
}
export const fetchTanstackDevelopmentPreviewRoute=makeTanstackDevelopmentFetchRoute();
