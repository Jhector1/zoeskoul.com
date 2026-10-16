import { NextResponse } from "next/server";

import { getBuildProjectCommand } from "@zoeskoul/build-application";
import {
  BuildPreparationError,
  prepareRegisteredBuildArtifactPlan,
} from "@zoeskoul/build-preparation";

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
        {
          ok: false,
          code: "BUILD_PROJECT_NOT_FOUND",
          message: "Project not found.",
        },
        404,
      );
    }

    if (!project.specification) {
      return json(
        requestId,
        {
          ok: false,
          code: "BUILD_PREPARATION_INVALID",
          message: "Project specification is unavailable.",
        },
        409,
      );
    }

    const preparation = prepareRegisteredBuildArtifactPlan({
      specification: project.specification,
      workspace: project.workspace,
      sourceVersion: project.sourceVersion,
    });

    return json(requestId, {
      ok: true,
      preparation,
    });
  } catch (error) {
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

    console.error(
      "[/api/build/projects/:buildProjectId/preparation] failed",
      {
        requestId,
        buildProjectId,
        userId: access.userId,
        error,
      },
    );

    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_PREPARATION_FAILED",
        message: "Build preparation could not be resolved.",
      },
      500,
    );
  }
}
