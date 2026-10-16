import { NextResponse } from "next/server";

import {
  BuildAiPlanningError,
} from "@zoeskoul/build-ai";
import {
  AiJsonUnsupportedModalityError,
} from "@zoeskoul/ai-json";
import {
  BuildAccessError,
  assertCanGenerateBuildWithAi,
} from "@zoeskoul/build-application";

import {
  BuildPlanRequestError,
  parseBuildPlanFormData,
} from "@/lib/build/buildPlanMedia";
import {
  ZoeBuildAiConfigurationError,
} from "@/lib/build/createZoeBuildAiPlanner";
import {
  BuildArchitectureUnsupportedError,
  planCostAwareZoeBuildProject,
} from "@/lib/build/costAwareZoeBuildPlanning";
import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";
import {
  enforceSameOriginPost,
  exceedsContentLength,
} from "@zoeskoul/platform-server/http";
import {
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BUILD_PLAN_BODY_BYTES = 14 * 1024 * 1024;

function json(
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
) {
  const response = NextResponse.json(
    { ...body, requestId },
    { status },
  );
  response.headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );
  response.headers.set("X-Request-Id", requestId);
  return response;
}

function retryAfterResponse(
  requestId: string,
  resetMs: number,
) {
  const response = json(
    requestId,
    {
      ok: false,
      code: "BUILD_RATE_LIMITED",
      message: "Too many AI planning requests.",
    },
    429,
  );

  response.headers.set(
    "Retry-After",
    String(
      Math.max(
        1,
        Math.ceil((resetMs - Date.now()) / 1000),
      ),
    ),
  );
  return response;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  if (!enforceSameOriginPost(req)) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_FORBIDDEN",
        message: "Forbidden.",
      },
      403,
    );
  }

  if (
    exceedsContentLength(req, MAX_BUILD_PLAN_BODY_BYTES)
  ) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_REQUEST_TOO_LARGE",
        message: "AI planning request is too large.",
      },
      413,
    );
  }

  const access = await loadCurrentBuildAccessSnapshot();

  let userId: string;

  try {
    userId = assertCanGenerateBuildWithAi(access);
  } catch (error) {
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
    throw error;
  }

  const limited = await rateLimit(
    `zoebuild-ai-plan:${userId}`,
    {
      bucket: "zoebuild-ai-plan",
      limit: 24,
      window: "1 h",
    },
  ).catch((error) => {
    console.error(
      "[/api/build/plan] rate limit unavailable",
      { requestId, error },
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
    return retryAfterResponse(
      requestId,
      limited.resetMs,
    );
  }

  try {
    let form: FormData;

    try {
      form = await req.formData();
    } catch {
      return json(
        requestId,
        {
          ok: false,
          code: "BUILD_AI_REQUEST_INVALID",
          message: "Expected a multipart planning request.",
        },
        400,
      );
    }

    const input = await parseBuildPlanFormData(form);

    const {
      plan,
      routing,
    } = await planCostAwareZoeBuildProject({
      prompt: input.prompt,
      media: input.media,
    });

    return json(requestId, {
      ok: true,
      plan,
      routing,
    });
  } catch (error) {
    if (error instanceof BuildArchitectureUnsupportedError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
          profile: {
            siteKind:
              error.profile.siteKind,
            industry:
              error.profile.industry,
            complexity:
              error.profile.complexity,
            commerceMode:
              error.profile.commerceMode,
          },
        },
        422,
      );
    }

    if (error instanceof ZoeBuildAiConfigurationError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "ZoeBuild AI is not configured.",
        },
        503,
      );
    }

    if (error instanceof BuildPlanRequestError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        error.code === "BUILD_AI_MEDIA_TOO_LARGE"
          ? 413
          : error.code === "BUILD_AI_MEDIA_UNSUPPORTED"
            ? 415
            : 400,
      );
    }

    if (error instanceof AiJsonUnsupportedModalityError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message:
            `The configured AI model does not support ${error.kind} input.`,
        },
        415,
      );
    }

    if (error instanceof BuildAiPlanningError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        error.code === "BUILD_AI_PROMPT_INVALID" ? 400 : 502,
      );
    }

    console.error("[/api/build/plan] failed", {
      requestId,
      userId,
      error,
    });

    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_AI_PLAN_FAILED",
        message: "Zoé could not create a build plan.",
      },
      502,
    );
  }
}
