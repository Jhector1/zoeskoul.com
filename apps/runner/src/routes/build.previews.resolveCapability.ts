import type {
  RequestHandler,
} from "express";

import {
  resolveReactPreviewContextByCapability,
} from "../services/build/reactPreviewRuntime.js";

/**
 * Internal ZoeBuild-server capability resolver.
 *
 * Global requireServiceAuth protects this route. It intentionally does not use
 * an end-user actor key: possession of the unguessable preview base path is the
 * read-only preview authorization boundary.
 */
export const resolveBuildPreviewCapabilityRoute:
  RequestHandler =
  async (
    req,
    res,
  ) => {
    try {
      const context =
        resolveReactPreviewContextByCapability({
          previewId:
            String(
              req.params.previewId,
            ),
          path:
            String(
              req.body?.path ??
              "",
            ),
        });

      return res
        .status(200)
        .json({
          ok: true,
          context,
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not resolve React preview capability.";

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
