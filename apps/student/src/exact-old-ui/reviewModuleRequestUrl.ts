import {
  resolveLegacyApiUrl,
} from "../compat/LegacyApiBridge";

export function buildReviewModuleRequestUrl(args: {
  apiOrigin: string;
  browserUrl: string;
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const query = new URLSearchParams({
    locale: args.locale,
  });

  const rawUrl =
    `/api/student-ui/review-modules/${encodeURIComponent(
      args.subjectSlug,
    )}/${encodeURIComponent(
      args.moduleSlug,
    )}?${query.toString()}`;

  return resolveLegacyApiUrl({
    rawUrl,
    browserUrl: args.browserUrl,
    apiOrigin: args.apiOrigin,
  });
}
