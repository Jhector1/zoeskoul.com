import { NextResponse } from "next/server";

import {
  BuildAccessError,
  BuildSourceConflictError,
  BuildSourceInputError,
  saveBuildProjectSourceCommand,
} from "@zoeskoul/build-application";

import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import {
  BuildWorkspaceMutationError,
  parseBuildWorkspaceMutation,
} from "@/lib/build/buildWorkspaceMutation";
import { createPrismaBuildProjectSourceWriter } from "@/lib/build/saveBuildProjectSource";
import { prisma } from "@zoeskoul/platform-server/prisma";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BUILD_SOURCE_BODY_BYTES = 12 * 1024 * 1024;

function json(
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();

  if (!enforceSameOriginPost(req)) {
    return json(
      requestId,
      { ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." },
      403,
    );
  }

  if (exceedsContentLength(req, MAX_BUILD_SOURCE_BODY_BYTES)) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_REQUEST_TOO_LARGE",
        message: "Workspace payload is too large.",
      },
      413,
    );
  }

  const access = await loadCurrentBuildAccessSnapshot();
  const userId = access.userId ?? "";
  if (!userId) {
    return json(
      requestId,
      { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." },
      401,
    );
  }

  const { buildProjectId } = await ctx.params;
  const limited = await rateLimit(
    `zoebuild-source-save:${userId}:${buildProjectId}`,
    {
      bucket: "zoebuild-source-save",
      limit: 240,
      window: "1 h",
    },
  ).catch((error) => {
    console.error("[/api/build/projects/:buildProjectId/source] rate limit unavailable", {
      requestId,
      buildProjectId,
      error,
    });
    return null;
  });

  if (!limited) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_SERVICE_UNAVAILABLE",
        message: "Service unavailable.",
      },
      503,
    );
  }

  if (!limited.ok) {
    const response = json(
      requestId,
      {
        ok: false,
        code: "BUILD_RATE_LIMITED",
        message: "Too many source-save requests.",
      },
      429,
    );
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((limited.resetMs - Date.now()) / 1000))),
    );
    return response;
  }

  const body = asRecord(await readJsonSafe(req));
  if (!body) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_SOURCE_INVALID",
        message: "Invalid JSON request.",
      },
      400,
    );
  }

  try {
    const baseVersion = body.baseVersion;
    if (!Number.isInteger(baseVersion) || Number(baseVersion) < 1) {
      throw new BuildSourceInputError(
        "baseVersion must be a positive integer.",
      );
    }

    const workspace = parseBuildWorkspaceMutation(body.workspace);
    const result = await saveBuildProjectSourceCommand({
      access,
      buildProjectId,
      baseVersion: Number(baseVersion),
      workspace,
      writer: createPrismaBuildProjectSourceWriter(prisma),
      clientInstanceId:
        typeof body.clientInstanceId === "string"
          ? body.clientInstanceId
          : null,
      clientDraftUpdatedAt:
        typeof body.clientDraftUpdatedAt === "string"
          ? body.clientDraftUpdatedAt
          : null,
    });

    if (!result) {
      return json(
        requestId,
        {
          ok: false,
          code: "BUILD_PROJECT_NOT_FOUND",
          message: "Project not found.",
        },
        404,
      );
    }

    return json(requestId, {
      ok: true,
      source: result,
    });
  } catch (error) {
    if (error instanceof BuildWorkspaceMutationError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Invalid workspace.",
          issues: [...error.issues],
        },
        400,
      );
    }

    if (error instanceof BuildSourceInputError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        400,
      );
    }

    if (error instanceof BuildSourceConflictError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
          conflict: error.conflict,
        },
        409,
      );
    }

    if (error instanceof BuildAccessError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }

    console.error("[/api/build/projects/:buildProjectId/source] save failed", {
      requestId,
      buildProjectId,
      userId,
      error,
    });

    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_SOURCE_SAVE_FAILED",
        message: "Source could not be saved.",
      },
      500,
    );
  }
}
