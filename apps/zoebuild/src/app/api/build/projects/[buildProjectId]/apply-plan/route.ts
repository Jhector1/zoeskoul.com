import {
  NextResponse,
} from "next/server";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  BuildSourceConflictError,
  BuildSourceInputError,
  BuildSpecificationError,
  applyBuildProjectPlanCommand,
  parseProjectSpecification,
} from "@zoeskoul/build-application";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";

import {
  createPrismaBuildProjectPlanWriter,
  BuildStackReplacementForbiddenError,
} from "@/lib/build/applyBuildProjectPlan";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";

import {
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MAX_APPLY_PLAN_BODY_BYTES =
  512 * 1024;

function json(
  requestId: string,
  body:
    Record<string, unknown>,
  status = 200,
) {
  const response =
    NextResponse.json(
      {
        ...body,
        requestId,
      },
      {
        status,
      },
    );

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  return response;
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as
        Record<
          string,
          unknown
        >
    : null;
}

export async function POST(
  req: Request,

  ctx: {
    params:
      Promise<{
        buildProjectId:
          string;
      }>;
  },
) {
  const requestId =
    crypto.randomUUID();

  if (
    !enforceSameOriginPost(
      req,
    )
  ) {
    return json(
      requestId,
      {
        ok: false,
        code:
          "BUILD_FORBIDDEN",
        message:
          "Forbidden.",
      },
      403,
    );
  }

  if (
    exceedsContentLength(
      req,
      MAX_APPLY_PLAN_BODY_BYTES,
    )
  ) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_REQUEST_TOO_LARGE",

        message:
          "Apply-plan request is too large.",
      },
      413,
    );
  }

  const access =
    await loadCurrentBuildAccessSnapshot();

  const userId =
    access.userId ?? "";

  if (!userId) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_AUTH_REQUIRED",

        message:
          "Unauthorized.",
      },
      401,
    );
  }

  const {
    buildProjectId,
  } = await ctx.params;

  const limited =
    await rateLimit(
      `zoebuild-apply-plan:${userId}:${buildProjectId}`,
      {
        bucket:
          "zoebuild-apply-plan",

        limit: 60,

        window:
          "1 h",
      },
    ).catch(
      (error) => {
        console.error(
          "[/api/build/projects/:buildProjectId/apply-plan] rate limit unavailable",
          {
            requestId,
            buildProjectId,
            error,
          },
        );

        return null;
      },
    );

  if (!limited) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_SERVICE_UNAVAILABLE",

        message:
          "Service unavailable.",
      },
      503,
    );
  }

  if (!limited.ok) {
    const response =
      json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_RATE_LIMITED",

          message:
            "Too many Apply Plan requests.",
        },
        429,
      );

    response.headers.set(
      "Retry-After",
      String(
        Math.max(
          1,

          Math.ceil(
            (
              limited.resetMs -
              Date.now()
            ) / 1000,
          ),
        ),
      ),
    );

    return response;
  }

  const body =
    asRecord(
      await readJsonSafe(
        req,
      ),
    );

  if (!body) {
    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_APPLY_INVALID",

        message:
          "Invalid JSON request.",
      },
      400,
    );
  }

  try {
    const baseVersion =
      body.baseVersion;

    if (
      !Number.isInteger(
        baseVersion,
      ) ||
      Number(
        baseVersion,
      ) < 1
    ) {
      throw new BuildSourceInputError(
        "baseVersion must be a positive integer.",
      );
    }

    const specification =
      parseProjectSpecification(
        body.specification,
      );

    const result =
      await applyBuildProjectPlanCommand({
        access,
        buildProjectId,

        baseVersion:
          Number(
            baseVersion,
          ),

        specification,

        createdAt:
          Date.now(),

        writer:
          createPrismaBuildProjectPlanWriter(
            prisma,
          ),
      });

    if (!result) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_PROJECT_NOT_FOUND",

          message:
            "Project not found.",
        },
        404,
      );
    }

    return json(
      requestId,
      {
        ok: true,
        apply: result,
      },
    );
  } catch (error) {
    if (error instanceof BuildStackReplacementForbiddenError) {
      return json(requestId, {
        ok: false,
        code: error.code,
        message: error.message,
      }, 409);
    }
    if (
      error instanceof
      BuildSpecificationError
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            "BUILD_SPEC_INVALID",

          message:
            "Invalid project specification.",

          issues:
            [
              ...error.issues,
            ],
        },
        400,
      );
    }

    if (
      error instanceof
      BuildSourceInputError ||
      error instanceof
      BuildProjectDefinitionError
    ) {
      return json(
        requestId,
        {
          ok: false,
          code:
            error.code,

          message:
            error.message,
        },
        400,
      );
    }

    if (
      error instanceof
      BuildSourceConflictError
    ) {
      return json(
        requestId,
        {
          ok: false,

          code:
            error.code,

          message:
            error.message,

          conflict:
            error.conflict,
        },
        409,
      );
    }

    if (
      error instanceof
      BuildAccessError
    ) {
      return json(
        requestId,
        {
          ok: false,
          code:
            error.code,

          message:
            error.message,
        },

        error.code ===
        "BUILD_AUTH_REQUIRED"
          ? 401
          : 403,
      );
    }

    console.error(
      "[/api/build/projects/:buildProjectId/apply-plan] failed",
      {
        requestId,
        buildProjectId,
        userId,
        error,
      },
    );

    return json(
      requestId,
      {
        ok: false,

        code:
          "BUILD_APPLY_FAILED",

        message:
          "Plan could not be applied.",
      },
      500,
    );
  }
}
