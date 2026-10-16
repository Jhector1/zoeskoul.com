import type {
  RequestHandler,
} from "express";

import {
  getRequiredActorKey,
} from "../middleware/serviceAuth.js";

import {
  fetchReactPreviewHttp,
} from "../services/build/reactPreviewRuntime.js";

export const fetchBuildPreviewRoute:
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

      const method =
        req.body?.method ===
        "HEAD"
          ? "HEAD"
          : "GET";

      const result =
        await fetchReactPreviewHttp({
          previewId:
            String(
              req.params.previewId,
            ),
          ownerKey:
            actorKey,
          path:
            String(
              req.body?.path ??
              "",
            ),
          method,
        });

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
