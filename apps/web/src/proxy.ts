// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

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
      pathname.startsWith("/admin") ||
      pathname.startsWith("/assignments") ||
      pathname.startsWith("/profile") ||
      pathname.startsWith("/subjects")
  );
}

const POSSIBLE_SESSION_COOKIES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

const LOCALE_COOKIE = "NEXT_LOCALE";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Redirect non-locale routes to saved locale when available
  if (!hasLocalePrefix(pathname)) {
    const saved = req.cookies.get(LOCALE_COOKIE)?.value;

    if (saved && routing.locales.includes(saved as any)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${saved}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  // Let next-intl do locale detection / redirects / rewrites
  const res = handleI18n(req);

  const { pathname: localizedPathname, search } = req.nextUrl;
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
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/authenticate`;
    url.searchParams.set("callbackUrl", localizedPathname + search);
    return NextResponse.redirect(url);
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
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/authenticate`;
    url.searchParams.set("callbackUrl", localizedPathname + search);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};