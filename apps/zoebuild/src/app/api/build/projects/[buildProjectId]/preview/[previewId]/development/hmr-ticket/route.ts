import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { parseReactPreviewId } from "@/lib/build/reactPreviewServer";
import { readDevelopmentPreviewRevision } from "@/lib/build/reactPreviewDevelopmentHttp";
import { browserError, response } from "@/lib/build/reactPreviewDevelopmentBrowserBoundary";
import { issueOwnedDevelopmentPreviewHmrTicket } from "@/lib/build/reactPreviewDevelopmentHmrTicket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Editor-session-only ticket issuance, not an iframe or WebSocket endpoint.
 * WebSocket routing is deliberately not registered in Phase 4E3C3B. */
export async function POST(request: Request, context: {
  params: Promise<{ buildProjectId: string; previewId: string }>;
}) {
  const requestId = crypto.randomUUID();
  if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED !== "true")
    return response(requestId, { ok: false, code: "BUILD_PREVIEW_NOT_FOUND" }, 404);
  if (!enforceSameOriginPost(request))
    return response(requestId, { ok: false, code: "BUILD_FORBIDDEN" }, 403);
  try {
    const access = await loadCurrentBuildAccessSnapshot(request, { requireAuthority: true });
    if (!access.userId)
      return response(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED" }, 401);
    const sourceVersion = await readDevelopmentPreviewRevision(request);
    const { buildProjectId, previewId: rawPreviewId } = await context.params;
    const previewId = parseReactPreviewId(rawPreviewId);
    const issued = await issueOwnedDevelopmentPreviewHmrTicket({
      access, buildProjectId, previewId, sourceVersion,
      requestOrigin: request.headers.get("origin"),
    });
    const result = response(requestId, {
      ok: true, ticket: issued.ticket, expiresInMs: issued.expiresInMs,
    });
    result.headers.set("Referrer-Policy", "no-referrer");
    return result;
  } catch (error) {
    return browserError(requestId, error);
  }
}
