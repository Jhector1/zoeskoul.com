import type {
  RequestHandler,
} from "express";

import {
  getRequiredActorKey,
} from "../middleware/serviceAuth.js";

import {
  fetchReactPreviewHttp,
} from "../services/build/reactPreviewRuntime.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import { fetchOwnedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";

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

      const previewId = String(req.params.previewId);
      const method = req.body?.method === "POST" ? "POST" :
        req.body?.method === "HEAD" ? "HEAD" : "GET";
      // TanStack mutations require actor ownership PLUS the exact source
      // version; the readable capability path never authorizes a POST.
      if (sharedFullStackPreviews.get(previewId)) {
        const result = await fetchOwnedTanstackPreview({
          ownerKey: actorKey,
          previewId,
          buildProjectId: typeof req.body?.buildProjectId === "string" ? req.body.buildProjectId : "",
          sourceVersion: req.body?.sourceVersion,
          path: String(req.body?.path ?? ""),
          method,
          headers: req.body?.headers,
          bodyBase64: req.body?.bodyBase64,
        });
        return res.status(200).json({ ok: true, response: result });
      }
      // The legacy preview is read-only. Never downgrade POST to GET.
      if (method === "POST") return res.status(405).json({ok:false,error:"Method not allowed."});
      const result = await fetchReactPreviewHttp({
        previewId, ownerKey: actorKey,
        path: String(req.body?.path ?? ""), method,
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

      const status = message === "Preview not found." ? 404 :
        message === "Forbidden." ? 403 :
        message === "Preview source is stale." ? 409 : 400;

      return res
        .status(status)
        .json({
          ok: false,
          error:
            message,
        });
    }
  };
