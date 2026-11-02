import type {
  RequestHandler,
} from "express";

import {
  fetchReactPreviewHttpByCapability,
} from "../services/build/reactPreviewRuntime.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import { fetchAdmittedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";

/**
 * Internal ZoeBuild-server proxy fetch.
 *
 * Global requireServiceAuth already protects this route. Unlike start/sync/
 * cancel, content fetch is authorized by the random capability embedded in
 * the requested Vite base path, so this route deliberately does not bind the
 * request to an end-user actor key.
 */
export const proxyFetchBuildPreviewRoute:
  RequestHandler =
  async (
    req,
    res,
  ) => {
    try {
      const method =
        req.body?.method ===
        "HEAD"
          ? "HEAD"
          : "GET";

      const previewId = String(req.params.previewId);
      const path = String(req.body?.path ?? "");
      const result = sharedFullStackPreviews.get(previewId)
        ? (await fetchAdmittedTanstackPreview({ previewId, path, method })).response
        : await fetchReactPreviewHttpByCapability({ previewId, path, method });

      return res
        .status(200)
        .json({
          ok: true,
          response:
            result,
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not fetch React preview.";

      const status =
        message ===
          "Preview not found."
          ? 404
          : 400;

      return res
        .status(status)
        .json({
          ok: false,
          error:
            message,
        });
    }
  };
