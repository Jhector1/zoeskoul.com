import type { RequestHandler } from "express";

import {
  parseTrustedBuildJobRequest,
  TANSTACK_PREVIEW_RESTART_REQUIRED,
} from "@zoeskoul/build-executor-contracts";

import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import { requireTanstackPreviewRestart } from "../services/build/tanstackPreviewSyncPolicy.js";

/** TanStack Start preview source is immutable for the lifetime of its isolated
 * sandbox. This authenticated endpoint can only authorize a restart signal.
 * It must never fall back to the deleted React/Vite workspace mutation engine
 * or permit a cross-owner/project/version request to trigger a restart.
 * The browser performs the existing authenticated cancel + fresh start flow.
 */
export const syncBuildPreviewRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const request = parseTrustedBuildJobRequest(req.body);
    if (request.operation !== "production-build") {
      return res.status(400).json({
        ok: false,
        error: "TanStack preview sync requires registered production-build source.",
      });
    }

    const previewId = String(req.params.previewId);
    const lease = sharedFullStackPreviews.get(previewId);
    // This policy always throws. It checks live lease -> owner -> project and
    // non-stale version -> stack/template before returning a restart signal.
    // Nothing in this endpoint writes source files or touches the container.
    requireTanstackPreviewRestart({ lease, ownerKey: actorKey, request });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not synchronize TanStack preview.";
    const status = message === TANSTACK_PREVIEW_RESTART_REQUIRED ||
      message === "Preview source is stale." ? 409 :
      message === "Preview not found." ? 404 :
      message === "Forbidden." ? 403 : 400;
    return res.status(status).json({ ok: false, error: message });
  }
};
