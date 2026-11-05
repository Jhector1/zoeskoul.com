import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { stopAdmittedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";

/** Cancel only the authenticated actor's canonical TanStack preview lease.
 * Unknown and retired preview IDs cannot fall through to an old runtime. */
export const cancelBuildPreviewRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const previewId = String(req.params.previewId);
    await stopAdmittedTanstackPreview(actorKey, previewId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stop preview.";
    const status = message === "Preview not found." ? 404 :
      message === "Forbidden." ? 403 : 400;
    return res.status(status).json({ ok: false, error: message });
  }
};
