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
  startReactPreview,
} from "../services/build/reactPreviewRuntime.js";

function statusForPreviewStartError(
  message: string,
) {
  if (message === "Preview source is stale.") return 409;
  if (
    message.includes(
      "Too many active sessions",
    ) ||
    message.includes(
      "Runner is busy",
    ) ||
    message.includes(
      "Too many code session starts",
    )
  ) {
    return 429;
  }

  if (
    message.includes(
      "disk is low",
    ) ||
    message.includes(
      "workspace root is over quota",
    )
  ) {
    return 503;
  }

  if (message.includes("did not become ready") ||
      message.includes("exited before becoming ready") ||
      message.includes("HTTP bridge")) return 503;

  return 400;
}

export const startBuildPreviewRoute:
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
              "React preview requires registered production-build source.",
          });
      }

      const preview =
        await startReactPreview({
          ownerKey:
            actorKey,
          request,
        });

      return res
        .status(201)
        .json({
          ok: true,
          preview,
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not start React preview.";

      return res
        .status(
          statusForPreviewStartError(
            message,
          ),
        )
        .json({
          ok: false,
          error:
            message,
        });
    }
  };
