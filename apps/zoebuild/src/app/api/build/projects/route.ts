import { NextResponse } from "next/server";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  BuildSpecificationError,
  createBuildProjectCommand,
  listBuildProjectsCommand,
  parseProjectSpecification,
} from "@zoeskoul/build-application";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectPersistence } from "@/lib/build/createBuildProject";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { prisma } from "@zoeskoul/platform-server/prisma";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CREATE_BUILD_BODY_BYTES = 32 * 1024;

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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function retryAfterResponse(requestId: string, resetMs: number) {
  const response = json(
    requestId,
    { ok: false, code: "BUILD_RATE_LIMITED", message: "Too many project creation requests." },
    429,
  );
  response.headers.set(
    "Retry-After",
    String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))),
  );
  return response;
}


export async function GET() {
  const requestId = crypto.randomUUID();
  const access = await loadCurrentBuildAccessSnapshot();

  if (!access.userId) {
    return json(
      requestId,
      { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." },
      401,
    );
  }

  try {
    const projects = await listBuildProjectsCommand({
      access,
      reader: createPrismaBuildProjectReader(prisma),
    });

    return json(requestId, { ok: true, projects });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }

    console.error("[/api/build/projects] list failed", {
      requestId,
      userId: access.userId,
      error,
    });

    return json(
      requestId,
      { ok: false, code: "BUILD_LIST_FAILED", message: "Projects could not be loaded." },
      500,
    );
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  if (!enforceSameOriginPost(req)) {
    return json(
      requestId,
      { ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." },
      403,
    );
  }

  if (exceedsContentLength(req, MAX_CREATE_BUILD_BODY_BYTES)) {
    return json(
      requestId,
      { ok: false, code: "BUILD_REQUEST_TOO_LARGE", message: "Request body is too large." },
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

  const limited = await rateLimit(`zoebuild-create:${userId}`, {
    bucket: "zoebuild-project-create",
    limit: 30,
    window: "1 h",
  }).catch((error) => {
    console.error("[/api/build/projects] rate limit unavailable", {
      requestId,
      error,
    });
    return null;
  });

  if (!limited) {
    return json(
      requestId,
      { ok: false, code: "BUILD_SERVICE_UNAVAILABLE", message: "Service unavailable." },
      503,
    );
  }
  if (!limited.ok) {
    return retryAfterResponse(requestId, limited.resetMs);
  }

  const body = asRecord(await readJsonSafe(req));
  if (!body || !("specification" in body)) {
    return json(
      requestId,
      { ok: false, code: "BUILD_SPEC_INVALID", message: "Project specification is required." },
      400,
    );
  }

  try {
    const specification = parseProjectSpecification(body.specification);
    const result = await createBuildProjectCommand({
      access,
      specification,
      createdAt: Date.now(),
      persistence: createPrismaBuildProjectPersistence(prisma),
    });

    return json(
      requestId,
      {
        ok: true,
        project: {
          codeProjectId: result.codeProjectId,
          buildProjectId: result.buildProjectId,
          sourceVersion: result.sourceVersion,
          stackId: result.stackId,
          templateId: result.templateId,
          dependencyLock: result.dependencyLock,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof BuildSpecificationError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Invalid project specification.",
          issues: [...error.issues],
        },
        400,
      );
    }

    if (error instanceof BuildProjectDefinitionError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        400,
      );
    }

    if (error instanceof BuildAccessError) {
      const status = error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403;
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        status,
      );
    }

    console.error("[/api/build/projects] create failed", {
      requestId,
      userId,
      error,
    });
    return json(
      requestId,
      { ok: false, code: "BUILD_CREATE_FAILED", message: "Project could not be created." },
      500,
    );
  }
}
