import { NextResponse } from "next/server";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES } from "@zoeskoul/build-executor-contracts";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import {
  createOwnedReactPreviewBuildRequest,
  ReactPreviewRequestError,
} from "@/lib/build/reactPreviewServer";
import { submitTrustedReactPreviewOperationAtRunner } from "@/lib/build/reactPreviewRunnerClient";
import { previewServerTimingHeader } from "@/lib/build/previewPerformance";
import { classifyPreviewRunnerFailure } from "@/lib/build/previewStartConflict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES;

function json(requestId: string, body: Record<string, unknown>, status = 200,
  timing: readonly Readonly<{name:string;durationMs:number}>[] = []) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  const serverTiming = previewServerTimingHeader(timing);
  if (serverTiming) response.headers.set("Server-Timing", serverTiming);
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
  const requestStartedAt = performance.now();
  const timing: {name:string;durationMs:number}[] = [];
  const requestId = crypto.randomUUID();
  const respond = (body: Record<string, unknown>, status = 200) => json(requestId, body, status,
    [...timing, {name:"zoe_total",durationMs:performance.now()-requestStartedAt}]);
  if (!enforceSameOriginPost(req)) {
    return respond({ ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." }, 403);
  }
  if (exceedsContentLength(req, MAX_BODY_BYTES)) {
    return respond({ ok: false, code: "BUILD_REQUEST_TOO_LARGE", message: "Preview workspace is too large." }, 413);
  }

  const authenticationStartedAt = performance.now();
  const access = await loadCurrentBuildAccessSnapshot().finally(() => {
    timing.push({name:"authentication",durationMs:performance.now()-authenticationStartedAt});
  });
  const userId = access.userId ?? "";
  if (!userId) {
    return respond({ ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." }, 401);
  }

  const { buildProjectId } = await ctx.params;
  const body = asRecord(await readJsonSafe(req));
  if (!body) {
    return respond({ ok: false, code: "BUILD_PREVIEW_INVALID", message: "Invalid preview request." }, 400);
  }

  try {
    const sourceAdmissionStartedAt = performance.now();
    const request = await createOwnedReactPreviewBuildRequest({
      access, buildProjectId, sourceVersion: body.sourceVersion, workspace: body.workspace,
    }).finally(() => {
      timing.push({name:"source_admission",durationMs:performance.now()-sourceAdmissionStartedAt});
    });
    // K20D: acknowledge a runner-owned operation without keeping the Next.js
    // request or browser connection open during a multi-minute install.
    const runnerOperationStartedAt = performance.now();
    const operation = await (async () => {
      const actorKey = await requireRunnerActorKey(userId);
      return submitTrustedReactPreviewOperationAtRunner({ actorKey, request });
    })().finally(() => {
      timing.push({name:"runner_operation",durationMs:performance.now()-runnerOperationStartedAt});
    });
    return respond({ ok: true, operation }, operation.state === "ready" ? 200 : 202);
  } catch (error) {
    if (error instanceof ReactPreviewRequestError) {
      return respond({ ok: false, code: error.code, message: error.message,
        ...(error.status === 409 ? {conflictCategory:"source_admission"} : {}) }, error.status);
    }
    if (error instanceof RunnerHttpError) {
      // No runner path, arbitrary error body, actor token or project source
      // crosses this browser-facing boundary. Correlate via requestId.
      console.warn("[ZoeBuild preview/start] runner unavailable", {
        requestId, upstreamStatus: error.status,
      });
      const failure = classifyPreviewRunnerFailure(error);
      return respond({ok:false,code:failure.code,
        ...(failure.conflictCategory ? {conflictCategory:failure.conflictCategory} : {}),
        message:failure.message},failure.status);
    }
    console.error("[/api/build/projects/:buildProjectId/preview/start] failed", {
      requestId, category:error instanceof Error ? error.name : "unknown",
    });
    return respond({ ok: false, code: "BUILD_PREVIEW_START_FAILED", message: "React preview could not be started." }, 500);
  }
}
