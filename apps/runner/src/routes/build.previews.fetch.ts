import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { fetchOwnedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";

/** Actor-authenticated TanStack full-stack transport. No bearer capability
 * can authorize a mutation; the Runner checks the owner, project, exact saved
 * revision and canonical capability base before reaching the sandbox. */
export const fetchBuildPreviewRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const method = req.body?.method;
    if (method !== "GET" && method !== "HEAD" && method !== "POST")
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    const previewId = String(req.params.previewId);
    const response = await fetchOwnedTanstackPreview({
      ownerKey: actorKey,
      previewId,
      buildProjectId: typeof req.body?.buildProjectId === "string" ? req.body.buildProjectId : "",
      sourceVersion: req.body?.sourceVersion,
      path: String(req.body?.path ?? ""),
      method,
      headers: req.body?.headers,
      bodyBase64: req.body?.bodyBase64,
    });
    return res.status(200).json({ ok: true, response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview unavailable.";
    const status = message === "Preview not found." ? 404 :
      message === "Forbidden." ? 403 :
      message === "Preview source is stale." ? 409 : 400;
    return res.status(status).json({ ok: false, error: message });
  }
};
