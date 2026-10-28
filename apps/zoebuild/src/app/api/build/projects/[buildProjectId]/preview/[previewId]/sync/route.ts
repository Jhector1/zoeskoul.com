import { NextResponse } from "next/server";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
  createOwnedReactPreviewBuildRequest,
  requireOwnedReactPreviewProject,
  parseReactPreviewId,
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import { syncTrustedReactPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function json(requestId: string, body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string; previewId: string }> },
) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) {
    return json(requestId, { ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." }, 403);
  }
  if (exceedsContentLength(req, MAX_BODY_BYTES)) {
    return json(requestId, { ok: false, code: "BUILD_REQUEST_TOO_LARGE", message: "Preview workspace is too large." }, 413);
  }

  const access = await loadCurrentBuildAccessSnapshot();
  const userId = access.userId ?? "";
  if (!userId) {
    return json(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." }, 401);
  }

  const { buildProjectId, previewId: rawPreviewId } = await ctx.params;
  const body = asRecord(await readJsonSafe(req));
  if (!body) {
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_INVALID", message: "Invalid preview request." }, 400);
  }

  try {
    const previewId = parseReactPreviewId(rawPreviewId);
    const request = await createOwnedReactPreviewBuildRequest({
      access,
      buildProjectId,
      sourceVersion: body.sourceVersion,
      workspace: body.workspace,
    });
    const actorKey = await requireRunnerActorKey(userId);
    await syncTrustedReactPreviewAtRunner({ actorKey, previewId, request });
    const afterSync = await requireOwnedReactPreviewProject({access,buildProjectId});
    if (afterSync.sourceVersion !== body.sourceVersion)
      return json(requestId,{ok:false,code:"BUILD_PREVIEW_SOURCE_CONFLICT",
        message:"The project changed while preview was updating."},409);
    return json(requestId, { ok: true, previewId });
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return json(requestId, { ok: false, code: error.code, message: error.message }, error.status);
    }
    if (error instanceof RunnerHttpError) {
      return json(
        requestId,
        { ok: false, code: error.status === 409 ? "BUILD_PREVIEW_SOURCE_CONFLICT" : error.status === 404 ? "BUILD_PREVIEW_NOT_FOUND" : "BUILD_PREVIEW_RUNNER_FAILED", message: error.status === 409 ? "A newer source revision is active. Refresh the project." : error.message },
        error.status === 409 ? 409 : error.status === 404 ? 404 : error.status === 429 ? 429 : 502,
      );
    }
    console.error("[/api/build/projects/:buildProjectId/preview/:previewId/sync] failed", { requestId, buildProjectId, userId, error });
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_SYNC_FAILED", message: "React preview could not be updated." }, 500);
  }
}
