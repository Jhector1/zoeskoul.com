import {
  loadReviewModulePageData,
} from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const {
    subjectSlug,
    moduleSlug,
  } = await context.params;

  const locale =
    new URL(request.url).searchParams.get(
      "locale",
    ) ?? "en";

  const pageData =
    await loadReviewModulePageData({
      subjectSlug,
      moduleSlug,
      locale,
      nextPath:
        `/${encodeURIComponent(locale)}` +
        `/subjects/${encodeURIComponent(
          subjectSlug,
        )}` +
        `/modules/${encodeURIComponent(
          moduleSlug,
        )}/learn`,
    });

  return appCorsJson(request, pageData);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
