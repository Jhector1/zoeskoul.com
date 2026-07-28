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

function requestLocale(request: Request): string {
  const value = new URL(request.url)
    .searchParams
    .get("locale")
    ?.trim()
    .toLowerCase();

  return value && SUPPORTED_LOCALES.has(value)
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

  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    return appCorsJson(
      request,
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!access.capabilities.accessStudentApp) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const target = parseStudentRuntimeTarget(
    url.searchParams,
  );

  if (!target) {
    return appCorsJson(
      request,
      {
        error: "Invalid runtime target",
        required: [
          "sectionSlug",
          "topicSlug",
          "ownerCardId",
          "targetKind",
          "targetId",
          "runtimeKind",
        ],
      },
      { status: 400 },
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
          access.capabilities.canUnlockAll,
      },
      subjectSlug,
      moduleSlug,
    });

  if (overview.status === "missing") {
    return appCorsJson(
      request,
      { error: "Runtime target not found" },
      { status: 404 },
    );
  }

  if (!overview.data.access.ok) {
    return appCorsJson(
      request,
      {
        error: "Module access denied",
        reason: overview.data.access.reason,
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
      { error: "Runtime target not found" },
      { status: 404 },
    );
  }

  const lesson = buildStudentLessonContent({
    overview: overview.data,
    reviewModule,
  });
  const launch = buildStudentRuntimeLaunch({
    lesson,
    target,
    locale: requestLocale(request),
    subjectSlug,
    moduleSlug,
  });

  if (!launch) {
    return appCorsJson(
      request,
      { error: "Runtime target not found" },
      { status: 404 },
    );
  }

  return appCorsJson(
    request,
    launch,
  );
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
