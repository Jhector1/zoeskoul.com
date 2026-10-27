import { NextResponse } from "next/server";

import {
  BuildAccessError,
  BuildSourceConflictError,
} from "@zoeskoul/build-application";

import {
  BuildBootstrapOutputError,
  BuildDependencyLockExecutionError,
  BuildPreparationError,
  bootstrapOwnedBuildProjectDependencyLock,
} from "@/lib/build/bootstrapBuildProjectLockfile";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { executeTrustedDependencyLockBootstrapAtRunner } from "@/lib/build/buildExecutorValidation";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { createPrismaBuildProjectSourceWriter } from "@/lib/build/saveBuildProjectSource";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(
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
    `zoebuild-lock-bootstrap:${userId}:${buildProjectId}`,
    {
      bucket: "zoebuild-lock-bootstrap",
      limit: 12,
      window: "1 h",
    },
  ).catch((error) => {
    console.error(
      "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] rate limit unavailable",
      { requestId, buildProjectId, error },
    );
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
        message: "Too many dependency bootstrap requests.",
      },
      429,
    );
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((limited.resetMs - Date.now()) / 1000))),
    );
    return response;
  }

  try {
    const actorKey = await requireRunnerActorKey(userId);

    const body: unknown = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency request." }, 400);
    }
    const options = body as Record<string, unknown>;
    const reconcileExisting = options.reconcileExisting === true;
    if (options.reconcileExisting !== undefined && typeof options.reconcileExisting !== "boolean") {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency action." }, 400);
    }
    const expectedSourceVersion = options.baseVersion;
    const desired = options.desiredDependencies;
    if (desired !== undefined && (!desired || typeof desired !== "object" || Array.isArray(desired))) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency selection." }, 400);
    }
    const chosen = desired as Record<string, unknown> | undefined;
    if (chosen && (!chosen.dependencies || typeof chosen.dependencies !== "object" || Array.isArray(chosen.dependencies) ||
      !chosen.devDependencies || typeof chosen.devDependencies !== "object" || Array.isArray(chosen.devDependencies))) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Expected complete pinned dependency groups." }, 400);
    }
    const result = await bootstrapOwnedBuildProjectDependencyLock({
      reconcileExisting,
      expectedSourceVersion: typeof expectedSourceVersion === "number" ? expectedSourceVersion : undefined,
      desiredDependencies: chosen ? {
        dependencies: chosen.dependencies as Record<string, string>,
        devDependencies: chosen.devDependencies as Record<string, string>,
      } : undefined,
      access,
      buildProjectId,
      actorKey,
      reader: createPrismaBuildProjectReader(prisma),
      writer: createPrismaBuildProjectSourceWriter(prisma),
      execute: executeTrustedDependencyLockBootstrapAtRunner,
      nodeId: crypto.randomUUID(),
      now: Date.now(),
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
      bootstrap: result,
    });
  } catch (error) {
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

    if (error instanceof BuildPreparationError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        409,
      );
    }

    if (error instanceof BuildBootstrapOutputError) {
      console.error(
        "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] invalid runner output",
        { requestId, buildProjectId, userId, error },
      );
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Dependency bootstrap returned an invalid result.",
        },
        502,
      );
    }

    if (error instanceof BuildDependencyLockExecutionError) {
      console.error(
        "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] runner failed",
        { requestId, buildProjectId, userId, error },
      );
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Dependency bootstrap service failed.",
        },
        502,
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

    console.error(
      "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] failed",
      { requestId, buildProjectId, userId, error },
    );

    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_DEPENDENCY_LOCK_BOOTSTRAP_FAILED",
        message: "Dependency lock could not be bootstrapped.",
      },
      500,
    );
  }
}
