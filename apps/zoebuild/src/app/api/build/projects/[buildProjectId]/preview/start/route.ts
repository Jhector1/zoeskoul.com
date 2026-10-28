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
import { startTrustedReactPreviewAtRunner, proxyFetchTrustedReactPreviewAtRunner, cancelTrustedReactPreviewAtRunner } from "@/lib/build/reactPreviewRunnerClient";

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
    // A runner start verifies Vite inside the process that created the preview.
    // Verify a *separate* capability fetch too: process-local preview registries
    // behind a non-sticky runner load balancer can otherwise return 201, then
    // 404 for every browser document. Do not claim this session is ready.
    let documentResponse;
    try {
      documentResponse = await proxyFetchTrustedReactPreviewAtRunner({
        previewId: preview.previewId,
        path: preview.basePath,
        method: "GET",
      });
    } catch (error) {
      if (error instanceof RunnerHttpError && error.status === 404) {
        void cancelTrustedReactPreviewAtRunner({ actorKey, previewId: preview.previewId }).catch(() => undefined);
        console.warn("[ZoeBuild preview/start] runner session not available to document fetch", {
          requestId, category: "runner-registry-miss", upstreamStatus: 404,
        });
        return json(requestId, {
          ok: false,
          code: "BUILD_PREVIEW_RUNNER_ROUTING",
          message: "The preview runner could not retrieve the session it just created. Check runner routing and restart the preview.",
        }, 503);
      }
      throw error;
    }
    const documentType = documentResponse.headers["content-type"] ?? "";
    if (documentResponse.status !== 200 || !/^text\/html(?:\s*;|\s*$)/i.test(documentType)) {
      void cancelTrustedReactPreviewAtRunner({ actorKey, previewId: preview.previewId }).catch(() => undefined);
      console.warn("[ZoeBuild preview/start] runner document not ready", {
        requestId, category: "invalid-preview-document", upstreamStatus: documentResponse.status,
      });
      return json(requestId, {
        ok: false,
        code: "BUILD_PREVIEW_DOCUMENT_NOT_READY",
        message: "The preview started but its website document is not ready. Retry the preview.",
      }, 503);
    }
    return json(requestId, { ok: true, preview }, 201);
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
      const status = error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return json(requestId, { ok: false, code: status === 429 ? "BUILD_PREVIEW_CAPACITY" :
        "BUILD_PREVIEW_RUNNER_UNAVAILABLE",
        message: status === 429 ? "Preview capacity reached; retry when a session is free." :
          "Preview runner is unavailable. Retry after checking the runner service." }, status);
    }
    console.error("[/api/build/projects/:buildProjectId/preview/start] failed", { requestId, buildProjectId, userId, error });
    return json(requestId, { ok: false, code: "BUILD_PREVIEW_START_FAILED", message: "React preview could not be started." }, 500);
  }
}
