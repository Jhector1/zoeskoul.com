import type { RequestHandler } from "express";
import { fetchAdmittedTanstackPreview } from "../services/build/tanstackPreviewSharedLifecycle.js";

/** Internal service-authenticated, bearer-capability transport for read-only
 * TanStack assets and SSR. POST is never permitted via a preview URL. The
 * canonical lease and exact capability base are verified by the lifecycle. */
export const proxyFetchBuildPreviewRoute: RequestHandler = async (req, res) => {
  try {
    const method = req.body?.method;
    if (method !== "GET" && method !== "HEAD")
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    const previewId = String(req.params.previewId);
    const path = String(req.body?.path ?? "");
    // Service-to-service enum, not a forwarded browser header. Preserve
    // Vite's CSS-vs-JS request negotiation without exposing other headers.
    const accept = req.body?.accept ?? "*/*";
    if (accept !== "text/css" && accept !== "*/*")
      return res.status(400).json({ ok: false, error: "Invalid preview Accept preference." });
    const result = await fetchAdmittedTanstackPreview({
      previewId, path, method, headers: { accept },
    });
    return res.status(200).json({ ok: true, response: result.response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview unavailable.";
    return res.status(message === "Preview not found." ? 404 : 400)
      .json({ ok: false, error: message });
  }
};
