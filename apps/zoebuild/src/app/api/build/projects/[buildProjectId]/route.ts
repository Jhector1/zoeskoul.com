import { NextResponse } from "next/server";

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
