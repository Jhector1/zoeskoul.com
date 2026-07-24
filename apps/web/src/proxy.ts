// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { isCatalogLearningPath } from "@/lib/routing/protectedLearningPath";

const handleI18n = createMiddleware(routing);

function stripLocale(pathname: string) {
  const parts = pathname.split("/");
  const maybeLocale = parts[1];

  if (routing.locales.includes(maybeLocale as any)) {
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
  return routing.locales.includes(maybeLocale as any);
}

function collapseDuplicateLocalePath(pathname: string) {
  const parts = pathname.split("/");
  const first = parts[1];
  const second = parts[2];

  if (
      first &&
      second &&
      routing.locales.includes(first as any) &&
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

  // 1) Collapse accidental double locale prefixes like /en/en/...
  const normalizedPath = collapseDuplicateLocalePath(pathname);
  if (normalizedPath) {
    const url = req.nextUrl.clone();
    url.pathname = normalizedPath;
    return NextResponse.redirect(url, 308);
  }

  // 2) Redirect non-locale routes to saved locale when available
  if (!hasLocalePrefix(pathname)) {
    const saved = req.cookies.get(LOCALE_COOKIE)?.value;

    if (saved && routing.locales.includes(saved as any)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${saved}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // 3) Let next-intl do locale detection / redirects / rewrites
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

  const opts: any = { req, secret };

  if (cookieName) {
    opts.cookieName = cookieName;
    opts.salt = cookieName;
  }

  const token = await getToken(opts);

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
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};