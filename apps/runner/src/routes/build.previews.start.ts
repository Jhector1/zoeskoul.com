import type {
  RequestHandler,
} from "express";

import {
  parseTrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";

import {
  getRequiredActorKey,
} from "../middleware/serviceAuth.js";

import { startAdmittedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";
import { authorizeTanstackPreviewSource, assertTanstackPreviewStartupEnabled } from "../services/build/tanstackPreviewSourceAuthorization.js";

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

      // Clean-slate admission: both registered IDs must match TanStack Start.
      // Reject before reserving capacity, launching Docker, or attempting a
      // fallback through the obsolete React/Vite preview runtime.
      if (request.stackId !== "tanstack-start-v1" || request.templateId !== "tanstack-start-v1") {
        return res.status(400).json({ ok: false, error: "Unsupported preview project stack." });
      }
      assertTanstackPreviewStartupEnabled();
      authorizeTanstackPreviewSource(request);
      const preview = await startAdmittedTanstackPreview({
        ownerKey: actorKey, request,
        authorize: async (_ownerKey, source) => authorizeTanstackPreviewSource(source),
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
