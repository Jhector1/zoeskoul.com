import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  buildStudentLessonContent,
} from "@/lib/learning/studentLessonContentData";
import {
  loadStudentModuleOverview,
} from "@/lib/learning/studentCourseReaderData";
import {
  buildStudentRuntimeLaunch,
  parseStudentRuntimeTarget,
} from "@/lib/learning/studentRuntimeLaunchData";
import {
  buildStudentRuntimePracticeLaunch,
} from "@/lib/learning/studentRuntimePracticeLaunch";
import {
  getClientIp,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  getResolvedReviewModule,
} from "@/lib/subjects/server/resolveSubjectPresentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES = new Set([
  "en",
  "es",
  "fr",
  "ht",
]);

function requestLocale(
  request: Request,
): string {
  const value = new URL(request.url)
    .searchParams
    .get("locale")
    ?.trim()
    .toLowerCase();

  return value &&
    SUPPORTED_LOCALES.has(value)
    ? value
    : "en";
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      subjectSlug: string;
      moduleSlug: string;
    }>;
  },
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user
  ) {
    return appCorsJson(
      request,
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (
    !access.capabilities
      .accessStudentApp
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const target =
    parseStudentRuntimeTarget(
      new URL(request.url)
        .searchParams,
    );

  if (!target) {
    return appCorsJson(
      request,
      {
        error:
          "Invalid runtime target",
      },
      { status: 400 },
    );
  }

  const supportedTarget =
    (
      target.targetKind === "card" &&
      target.runtimeKind === "quiz"
    ) ||
    (
      target.targetKind === "embedded_try_it" &&
      target.runtimeKind === "try_it"
    );

  if (!supportedTarget) {
    return appCorsJson(
      request,
      {
        error:
          "Runtime activity has not migrated",
        code:
          "RUNTIME_NOT_MIGRATED",
      },
      { status: 409 },
    );
  }

  try {
    const limited = await rateLimit(
      `student-practice-launch:` +
      `${access.user.id}:` +
      getClientIp(request),
    );

    if (!limited.ok) {
      const response = appCorsJson(
        request,
        {
          error:
            "Too many requests",
        },
        { status: 429 },
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
  } catch {
    return appCorsJson(
      request,
      {
        error:
          "Service unavailable",
      },
      { status: 503 },
    );
  }

  const {
    subjectSlug,
    moduleSlug,
  } = await context.params;

  const overview =
    await loadStudentModuleOverview({
      actor: {
        userId: access.user.id,
        canUnlockAll:
          access.capabilities
            .canUnlockAll,
      },
      subjectSlug,
      moduleSlug,
    });

  if (
    overview.status === "missing"
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Runtime target not found",
      },
      { status: 404 },
    );
  }

  if (!overview.data.access.ok) {
    return appCorsJson(
      request,
      {
        error:
          "Module access denied",
        reason:
          overview.data.access.reason,
      },
      { status: 403 },
    );
  }

  const reviewModule =
    await getResolvedReviewModule(
      subjectSlug,
      moduleSlug,
    );

  if (!reviewModule) {
    return appCorsJson(
      request,
      {
        error:
          "Runtime target not found",
      },
      { status: 404 },
    );
  }

  const protectedTarget =
    buildStudentRuntimeLaunch({
      lesson:
        buildStudentLessonContent({
          overview: overview.data,
          reviewModule,
        }),
      target,
      locale:
        requestLocale(request),
      subjectSlug,
      moduleSlug,
    });

  if (!protectedTarget) {
    return appCorsJson(
      request,
      {
        error:
          "Runtime target not found",
      },
      { status: 404 },
    );
  }

  const result =
    await buildStudentRuntimePracticeLaunch({
      request,
      actor: {
        userId: access.user.id,
        guestId: null,
      },
      locale:
        requestLocale(request),
      subjectSlug,
      moduleSlug,
      reviewModule,
      target,
    });

  if (result.kind === "unsupported") {
    return appCorsJson(
      request,
      {
        error:
          "Runtime activity has not migrated",
        code:
          "RUNTIME_NOT_MIGRATED",
        reason: result.reason,
        legacyHref:
          protectedTarget.activity.href,
      },
      { status: 409 },
    );
  }

  if (result.kind === "error") {
    return appCorsJson(
      request,
      result.body,
      { status: result.status },
    );
  }

  return appCorsJson(
    request,
    result.response,
  );
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(request);
}
