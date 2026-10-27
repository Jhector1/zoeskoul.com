import { NextResponse } from "next/server";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { deleteOwnedBuildProject, BuildProjectDeleteBlockedError } from "@/lib/build/deleteOwnedBuildProject";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { prisma } from "@zoeskoul/platform-server/prisma";

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const access = await loadCurrentBuildAccessSnapshot();

  if (!access.userId) {
    return json(
      requestId,
      { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." },
      401,
    );
  }

  const { buildProjectId } = await ctx.params;

  try {
    const project = await getBuildProjectCommand({
      access,
      buildProjectId,
      reader: createPrismaBuildProjectReader(prisma),
    });

    if (!project) {
      return json(
        requestId,
        { ok: false, code: "BUILD_PROJECT_NOT_FOUND", message: "Project not found." },
        404,
      );
    }

    return json(requestId, { ok: true, project });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }

    if (error instanceof BuildProjectDefinitionError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        400,
      );
    }

    console.error("[/api/build/projects/:buildProjectId] read failed", {
      requestId,
      buildProjectId,
      userId: access.userId,
      error,
    });

    return json(
      requestId,
      { ok: false, code: "BUILD_READ_FAILED", message: "Project could not be loaded." },
      500,
    );
  }
}

/** Destructive owner action. Never accepts a project ID or authority from the request body. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) {
    return json(requestId, { ok: false, code: "BUILD_FORBIDDEN" }, 403);
  }
  const access = await loadCurrentBuildAccessSnapshot(req, { requireAuthority: true });
  if (!access.userId) {
    return json(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED" }, 401);
  }
  const { buildProjectId } = await ctx.params;
  const limited = await rateLimit(`zoebuild-project-delete:${access.userId}`, {
    bucket: "zoebuild-project-delete", limit: 6, window: "1 h",
  }).catch(() => null);
  if (!limited) return json(requestId, { ok: false, code: "BUILD_SERVICE_UNAVAILABLE" }, 503);
  if (!limited.ok) return json(requestId, { ok: false, code: "BUILD_RATE_LIMITED" }, 429);
  if (Number(req.headers.get("content-length") || "0") > 1024) {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  let payload: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) throw new Error("invalid");
    payload = JSON.parse(raw);
  } catch {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      typeof (payload as { confirmTitle?: unknown }).confirmTitle !== "string") {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  try {
    const status = await deleteOwnedBuildProject(prisma, {
      ownerId: access.userId, buildProjectId,
      expectedTitle: (payload as { confirmTitle: string }).confirmTitle,
    });
    if (status === "not-found") return json(requestId, { ok: false, code: "BUILD_PROJECT_NOT_FOUND" }, 404);
    if (status === "title-mismatch") return json(requestId, { ok: false, code: "BUILD_DELETE_TITLE_MISMATCH" }, 409);
    return json(requestId, { ok: true, deleted: true });
  } catch (error) {
    if (error instanceof BuildProjectDeleteBlockedError) {
      return json(requestId, { ok: false, code: error.code,
        message: "This project has transactions or external/active resources that require cleanup before permanent deletion." }, 409);
    }
    console.error("[ZoeBuild project deletion] failed", { requestId, buildProjectId, kind: error instanceof Error ? error.name : "unknown" });
    return json(requestId, { ok: false, code: "BUILD_DELETE_UNAVAILABLE",
      message: "Project was not deleted. Try again later." }, 503);
  }
}
