// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import createMiddleware from "next-intl/middleware";
import {
  parseAcceptLanguage,
  resolveInitialAppLocale,
} from "@zoeskoul/preferences";
import { routing } from "@/i18n/routing";
import { isCatalogLearningPath } from "@/lib/routing/protectedLearningPath";
import { handleAppApiCorsBoundary } from "@/lib/http/appApiCorsBoundary";
import { resolveStudentRouteHandoff } from "@/lib/navigation/studentRouteHandoff";

const handleI18n = createMiddleware(routing);

type RoutingLocale = (typeof routing.locales)[number];

function isRoutingLocale(value: string | undefined): value is RoutingLocale {
  return (
    typeof value === "string" &&
    routing.locales.some((locale) => locale === value)
  );
}

function stripLocale(pathname: string) {
  const parts = pathname.split("/");
  const maybeLocale = parts[1];

  if (isRoutingLocale(maybeLocale)) {
    const rest = "/" + parts.slice(2).join("/");
    return {
      locale: maybeLocale,
      path: rest === "/" ? "/" : rest,
    };
  }

  return {
    locale: routing.defaultLocale,
    path: pathname,
  };
}

function hasLocalePrefix(pathname: string) {
  const maybeLocale = pathname.split("/")[1];
  return isRoutingLocale(maybeLocale);
}

function collapseDuplicateLocalePath(pathname: string) {
  const parts = pathname.split("/");
  const first = parts[1];
  const second = parts[2];

  if (
      first &&
      second &&
      isRoutingLocale(first) &&
      first === second
  ) {
    const rest = parts.slice(3).join("/");
    return rest ? `/${first}/${rest}` : `/${first}`;
  }

  return null;
}

function isPublicPath(pathname: string) {
  // pathname is locale-stripped
  return (
      pathname === "/" ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/authenticate") ||
      pathname.startsWith("/pricing") ||
      pathname.startsWith("/billing")
  );
}

function isProtectedPath(pathname: string) {
  // pathname is locale-stripped
  return (
      pathname === "/sandbox/programming/shell"
      ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/assignments") ||
      pathname.startsWith("/profile") ||
      pathname.startsWith("/tutoring-sessions") ||
      pathname.startsWith("/subjects") ||
      isCatalogLearningPath(pathname)
  );
}

const POSSIBLE_SESSION_COOKIES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

const LOCALE_COOKIE = "NEXT_LOCALE";

function localePathname(
  pathname: string,
  locale: RoutingLocale,
) {
  const { path } = stripLocale(pathname);
  return `/${locale}${path === "/" ? "" : path}`;
}

function requestCountry(req: NextRequest) {
  return (
    req.headers.get("x-vercel-ip-country") ??
    req.headers.get("cf-ipcountry") ??
    req.headers.get("x-country-code")
  );
}

function redirectToAuthenticate(args: {
  req: NextRequest;
  locale: string;
  callbackUrl: string;
  protectedPath: string;
}) {
  const url = args.req.nextUrl.clone();
  url.pathname = `/${args.locale}/authenticate`;
  url.search = "";
  url.searchParams.set("callbackUrl", args.callbackUrl);

  if (args.protectedPath.startsWith("/tutoring-sessions")) {
    url.searchParams.set("reason", "tutoring_session");
  }

  return NextResponse.redirect(url);
}

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const apiCorsResponse = handleAppApiCorsBoundary(req);
  if (apiCorsResponse) {
    return apiCorsResponse;
  }

  // 1) Collapse accidental double locale prefixes like /en/en/...
  const normalizedPath = collapseDuplicateLocalePath(pathname);
  if (normalizedPath) {
    const url = req.nextUrl.clone();
    url.pathname = normalizedPath;
    return NextResponse.redirect(url, 308);
  }

  // 2) Canonical locale precedence for page routes:
  // saved user choice -> browser language -> country fallback -> English.
  // API paths are never localized.
  const localeRoutable =
    pathname !== "/api" &&
    !pathname.startsWith("/api/");
  const savedLocale =
    req.cookies.get(LOCALE_COOKIE)?.value;

  if (
    localeRoutable &&
    isRoutingLocale(savedLocale)
  ) {
    const routeLocale =
      pathname.split("/")[1];

    if (
      !hasLocalePrefix(pathname) ||
      routeLocale !== savedLocale
    ) {
      const url = req.nextUrl.clone();
      url.pathname =
        localePathname(
          pathname,
          savedLocale,
        );
      return NextResponse.redirect(url);
    }
  } else if (
    localeRoutable &&
    !hasLocalePrefix(pathname)
  ) {
    const inferredLocale =
      resolveInitialAppLocale({
        languages: parseAcceptLanguage(
          req.headers.get("accept-language"),
        ),
        country: requestCountry(req),
        fallback: routing.defaultLocale,
      });

    const url = req.nextUrl.clone();
    url.pathname =
      localePathname(
        pathname,
        inferredLocale,
      );
    return NextResponse.redirect(url);
  }

  // 3) Cross-app handoff is controlled by an explicit, currently empty,
  // production-qualified allowlist in @zoeskoul/app-config. Unlocalized
  // requests still pass through next-intl first so locale detection remains
  // unchanged.
  if (hasLocalePrefix(pathname)) {
    const studentHandoff = resolveStudentRouteHandoff({
      currentUrl: req.nextUrl.toString(),
    });
    if (studentHandoff) {
      return NextResponse.redirect(studentHandoff, 307);
    }
  }

  // 4) Let next-intl do locale detection / redirects / rewrites
  const res = handleI18n(req);

  const { pathname: localizedPathname } = req.nextUrl;
  const { locale, path } = stripLocale(localizedPathname);

  // Prevent auth pages from being indexed
  if (path.startsWith("/authenticate")) {
    res.headers.set(
        "X-Robots-Tag",
        "noindex, nofollow, noarchive, nosnippet"
    );
  }

  // Only protect actual protected routes
  if (!isProtectedPath(path) || isPublicPath(path)) {
    return res;
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    return redirectToAuthenticate({
      req,
      locale,
      callbackUrl: localizedPathname + search,
      protectedPath: path,
    });
  }

  const cookieName =
      POSSIBLE_SESSION_COOKIES.find((name) => req.cookies.get(name)) ?? undefined;

  const tokenOptions: Parameters<typeof getToken>[0] = {
    req,
    secret,
    ...(cookieName
      ? { cookieName, salt: cookieName }
      : {}),
  };

  const token = await getToken(tokenOptions);

  if (!token) {
    return redirectToAuthenticate({
      req,
      locale,
      callbackUrl: localizedPathname + search,
      protectedPath: path,
    });
  }

  return res;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|_next|favicon.ico|.*\\..*).*)",
  ],
};
