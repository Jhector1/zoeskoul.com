import type { RequestHandler } from "express";
import { resolveAdmittedTanstackPreviewCapability } from "../services/build/tanstackPreviewSharedLifecycle.js";

/** Internal service-authenticated capability resolver. The random browser
 * capability authorizes read-only GET/HEAD, never an owner-bound mutation. */
export const resolveBuildPreviewCapabilityRoute: RequestHandler = async (req, res) => {
  try {
    const previewId = String(req.params.previewId);
    const path = String(req.body?.path ?? "");
    const context = resolveAdmittedTanstackPreviewCapability({ previewId, path });
    return res.status(200).json({ ok: true, context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview capability unavailable.";
    return res.status(message === "Preview not found." ? 404 : 400)
      .json({ ok: false, error: message });
  }
};
