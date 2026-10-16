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
import { startTrustedReactPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";

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
    const preview = await startTrustedReactPreviewAtRunner({ actorKey, request });
    return json(requestId, { ok: true, preview }, 201);
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return json(requestId, { ok: false, code: error.code, message: error.message }, error.status);
    }
    if (error instanceof RunnerHttpError) {
      return json(requestId, { ok: false, code: "BUILD_PREVIEW_RUNNER_FAILED", message: error.message }, error.status === 429 ? 429 : 502);
    }
    console.error("[/api/build/projects/:buildProjectId/preview/start] failed", { requestId, buildProjectId, userId, error });
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_START_FAILED", message: "React preview could not be started." }, 500);
  }
}
