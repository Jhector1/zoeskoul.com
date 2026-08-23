import {
  getCurrentUserAccess,
} from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import {
  DAILY_PRACTICE_TARGET_COUNT,
} from "@/lib/practice/experience/config";
import {
  loadPracticeChooser,
} from "@/lib/practice/experience/practiceChooser.server";
import {
  loadSubscriberPracticeContinuations,
} from "@/lib/practice/experience/subscriberPracticeSessions.server";
import {
  resolvePracticeViewer,
} from "@/lib/practice/experience/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES =
  new Set([
    "en",
    "es",
    "fr",
    "ht",
  ]);

export async function GET(
  request: Request,
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

  const url =
    new URL(request.url);
  const requestedLocale =
    url.searchParams
      .get("locale")
      ?.trim()
      .toLowerCase();
  const locale =
    requestedLocale &&
    SUPPORTED_LOCALES.has(
      requestedLocale,
    )
      ? requestedLocale
      : "en";
  const actor = {
    userId: access.user.id,
    guestId: null,
  };
  const viewer =
    await resolvePracticeViewer(
      prisma,
      actor,
    );
  const mode =
    viewer.subscribed
      ? "subscriber"
      : "free";
  const catalogs =
    await loadPracticeChooser({
      actor,
      locale,
      mode,
      catalogIdentity: {
        userId: access.user.id,
        email: access.user.email,
      },
    });
  const continuations =
    mode === "subscriber"
      ? await loadSubscriberPracticeContinuations({
          userId: access.user.id,
          catalogs,
          limit: 5,
        })
      : [];
  const subjectSlug =
    url.searchParams.get(
      "subject",
    ) ?? "";
  const catalogFromSubject =
    subjectSlug
      ? catalogs.find(
          (catalog) =>
            catalog.courses.some(
              (course) =>
                course.slug ===
                subjectSlug,
            ),
        )
      : null;

  return appCorsJson(
    request,
    {
      locale,
      mode,
      catalogs,
      targetCount:
        DAILY_PRACTICE_TARGET_COUNT,
      initialSelection: {
        catalogSlug:
          url.searchParams.get(
            "catalog",
          ) ??
          catalogFromSubject?.slug ??
          "",
        subjectSlug,
        moduleSlug:
          url.searchParams.get(
            "module",
          ) ?? "",
        sectionSlug:
          url.searchParams.get(
            "section",
          ) ?? "",
        topicSlug:
          url.searchParams.get(
            "topic",
          ) ?? "",
      },
      continuations,
      continueToPractice:
        url.searchParams.get("continue") === "practice",
    },
  );
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(
    request,
  );
}
