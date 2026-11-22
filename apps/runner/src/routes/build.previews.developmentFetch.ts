import type { Request, RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import {
  normalizeDevelopmentPreviewRelativePath,
  readOwnedTanstackDevelopmentPreview,
} from "../services/build/tanstackDevelopmentPreviewRead.js";

const ACTOR = /^u:[0-9a-f]{64}$/;
const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT = /^[A-Za-z0-9_-]{1,128}$/;
type ReadArgs = Parameters<typeof readOwnedTanstackDevelopmentPreview>[0];
type Dependencies = Readonly<{
  enabled: () => boolean;
  actorKey: (req:Request) => string;
  read: (input:ReadArgs) => ReturnType<typeof readOwnedTanstackDevelopmentPreview>;
}>;
const productionDeps:Dependencies = {
  enabled:()=>process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_READ_ENABLED === "true",
  actorKey:getRequiredActorKey,
  read:readOwnedTanstackDevelopmentPreview,
};

/** Service-authenticated read endpoint, never accessible through a browser
 * capability or via the existing immutable /proxy-fetch route.
 * Global requireServiceAuth must precede this handler in app.ts.
 */
export function makeTanstackDevelopmentFetchRoute(deps:Dependencies=productionDeps):RequestHandler {
  return async (req,res) => {
    if (!deps.enabled()) return res.status(404).json({ok:false,code:"NOT_FOUND"});
    let input:ReadArgs;
    try {
      const actorKey = deps.actorKey(req);
      const previewId = String(req.params.previewId ?? "");
      // Restrict the inbound command; do not forward arbitrary browser headers,
      // credentials, WebSocket headers, request bodies or HTTP methods to Vite.
      const value:unknown = req.body;
      if (!value || typeof value!=="object" || Array.isArray(value))
        throw new Error("Invalid request.");
      const body=value as Record<string,unknown>;
      if (Object.keys(body).sort().join(",")!==
          "accept,buildProjectId,method,path,sourceVersion")
        throw new Error("Invalid request.");
      if (!ACTOR.test(actorKey) || !PREVIEW.test(previewId) ||
          typeof body.buildProjectId !== "string" ||
          !PROJECT.test(body.buildProjectId) ||
          typeof body.path !== "string" || body.path.length > 4096 ||
          !Number.isSafeInteger(body.sourceVersion) ||
          typeof body.sourceVersion !== "number" || body.sourceVersion < 1 ||
          (body.method!=="GET" && body.method!=="HEAD") ||
          (body.accept!=="*/*" && body.accept!=="text/css"))
        throw new Error("Invalid request.");
      const relativePath = normalizeDevelopmentPreviewRelativePath(body.path);
      input={
        ownerKey:actorKey,previewId,buildProjectId:body.buildProjectId,
        sourceVersion:body.sourceVersion,path:relativePath,
        method:body.method,accept:body.accept,
      };
    } catch {return res.status(400).json({ok:false,code:"INVALID_REQUEST"});}
    try {
      const result=await deps.read(input);
      return res.status(200).json({ok:true,response:result.response,
        sourceVersion:result.sourceVersion});
    } catch {
      // Prevent a caller from inferring whether an owner, preview or source
      // exists. Avoid returning Vite, Docker or source details in errors.
      return res.status(404).json({ok:false,code:"NOT_FOUND"});
    }
  };
}
export const fetchTanstackDevelopmentPreviewRoute=makeTanstackDevelopmentFetchRoute();
