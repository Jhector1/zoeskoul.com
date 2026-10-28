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
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import { submitTrustedReactPreviewOperationAtRunner } from "@/lib/build/reactPreviewRunnerClient";

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
  ctx: { params: Promise<{ buildProjectId: string }> },
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

  const { buildProjectId } = await ctx.params;
  const body = asRecord(await readJsonSafe(req));
  if (!body) {
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_INVALID", message: "Invalid preview request." }, 400);
  }

  try {
    const request = await createOwnedReactPreviewBuildRequest({
      access,
      buildProjectId,
      sourceVersion: body.sourceVersion,
      workspace: body.workspace,
    });
    const actorKey = await requireRunnerActorKey(userId);
    // K20D: acknowledge a runner-owned operation without keeping the Next.js
    // request or browser connection open during a multi-minute install.
    const operation = await submitTrustedReactPreviewOperationAtRunner({ actorKey, request });
    return json(requestId, { ok: true, operation }, operation.state === "ready" ? 200 : 202);
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return json(requestId, { ok: false, code: error.code, message: error.message }, error.status);
    }
    if (error instanceof RunnerHttpError) {
      // No runner path, arbitrary error body, actor token or project source
      // crosses this browser-facing boundary. Correlate via requestId.
      console.warn("[ZoeBuild preview/start] runner unavailable", {
        requestId, upstreamStatus: error.status,
      });
      const status = error.status === 409 ? 409 : error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return json(requestId, { ok: false, code: status === 409 ? "BUILD_PREVIEW_SOURCE_CONFLICT" : status === 429 ? "BUILD_PREVIEW_CAPACITY" :
        "BUILD_PREVIEW_RUNNER_UNAVAILABLE",
        message: status === 409 ? "A newer preview source is selected. Refresh the project." : status === 429 ? "Preview capacity reached; retry when a session is free." :
          "Preview runner is unavailable. Retry after checking the runner service." }, status);
    }
    console.error("[/api/build/projects/:buildProjectId/preview/start] failed", { requestId, buildProjectId, userId, error });
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_START_FAILED", message: "React preview could not be started." }, 500);
  }
}
