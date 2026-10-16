import { NextResponse } from "next/server";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
  parseReactPreviewId,
  requireOwnedReactPreviewProject,
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import { cancelTrustedReactPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(requestId: string, body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string }> },
) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) {
    return json(requestId, { ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." }, 403);
  }

  const access = await loadCurrentBuildAccessSnapshot();
  const userId = access.userId ?? "";
  if (!userId) {
    return json(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." }, 401);
  }

  const { buildProjectId, previewId: rawPreviewId } = await ctx.params;
  try {
    const previewId = parseReactPreviewId(rawPreviewId);
    await requireOwnedReactPreviewProject({ access, buildProjectId });
    const actorKey = await requireRunnerActorKey(userId);
    await cancelTrustedReactPreviewAtRunner({ actorKey, previewId });
    return json(requestId, { ok: true });
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return json(requestId, { ok: false, code: error.code, message: error.message }, error.status);
    }
    if (error instanceof RunnerHttpError && error.status === 404) {
      return json(requestId, { ok: true, alreadyStopped: true });
    }
    if (error instanceof RunnerHttpError) {
      return json(requestId, { ok: false, code: "BUILD_PREVIEW_RUNNER_FAILED", message: error.message }, 502);
    }
    console.error("[/api/build/projects/:buildProjectId/preview/:previewId/cancel] failed", { requestId, buildProjectId, userId, error });
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_CANCEL_FAILED", message: "React preview could not be stopped." }, 500);
  }
}
