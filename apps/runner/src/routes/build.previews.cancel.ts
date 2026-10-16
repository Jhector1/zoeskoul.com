import type {
  RequestHandler,
} from "express";

import {
  getRequiredActorKey,
} from "../middleware/serviceAuth.js";

import {
  stopReactPreview,
} from "../services/build/reactPreviewRuntime.js";

export const cancelBuildPreviewRoute:
  RequestHandler =
  async (
    req,
    res,
  ) => {
    try {
      const actorKey =
        getRequiredActorKey(
          req,
        );

      await stopReactPreview({
        previewId:
          String(
            req.params.previewId,
          ),
        ownerKey:
          actorKey,
      });

      return res
        .status(200)
        .json({
          ok: true,
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not stop React preview.";

      const status =
        message ===
          "Preview not found."
          ? 404
          : message ===
              "Forbidden."
            ? 403
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
