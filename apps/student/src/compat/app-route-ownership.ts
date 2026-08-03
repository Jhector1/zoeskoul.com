import {
  buildLocalizedAppUrl,
  readRouteLocale,
  resolveAppRouteOwner,
  routePathSegments,
} from "@zoeskoul/app-config";

export function studentLocaleFromPath(
  pathname: string,
) {
  return readRouteLocale(pathname);
}

/**
 * The origin decides what the bare root means.
 *
 * On the student origin, both "/" and a localized root such as "/fr"
 * normalize to My Learning. Header Home is still converted explicitly to
 * the website origin by externalWebsiteHref().
 */
export function normalizeStudentPathname(
  pathname: string,
) {
  const parts =
    routePathSegments(pathname);

  if (parts.length === 0) {
    return "/en/subjects";
  }

  if (
    parts.length === 1 &&
    /^(en|es|fr|ht)$/.test(
      parts[0] ?? "",
    )
  ) {
    return `/${parts[0]}/subjects`;
  }

  return pathname || "/en/subjects";
}

export function isNextOwnedPath(
  pathname: string,
) {
  return (
    resolveAppRouteOwner({
      pathname,
      currentApp: "student",
    }) === "website"
  );
}

export function externalWebsiteHref(args: {
  rawHref: string;
  locale: string;
  websiteOrigin: string;
}) {
  const raw =
    args.rawHref.trim();

  if (
    /^(?:https?:|mailto:|tel:|#)/.test(
      raw,
    )
  ) {
    return raw;
  }

  const url =
    new URL(
      raw || "/",
      "https://student.invalid",
    );
  const owner =
    url.pathname === "/"
      ? "website"
      : resolveAppRouteOwner({
          pathname: url.pathname,
          currentApp: "student",
        });

  if (owner !== "website") {
    return null;
  }

  return buildLocalizedAppUrl({
    origin: args.websiteOrigin,
    pathname:
      url.pathname +
      url.search +
      url.hash,
    locale: args.locale,
  });
}
