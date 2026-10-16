import type {
  RequestHandler,
} from "express";

import {
  parseTrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";

import {
  getRequiredActorKey,
} from "../middleware/serviceAuth.js";

import {
  syncReactPreview,
} from "../services/build/reactPreviewRuntime.js";

export const syncBuildPreviewRoute:
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

      const request =
        parseTrustedBuildJobRequest(
          req.body,
        );

      if (
        request.operation !==
        "production-build"
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "React preview sync requires registered production-build source.",
          });
      }

      const result =
        await syncReactPreview({
          previewId:
            String(
              req.params.previewId,
            ),
          ownerKey:
            actorKey,
          request,
        });

      return res
        .status(200)
        .json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync React preview.";

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
