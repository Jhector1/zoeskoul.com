import type { NextRequest } from "next/server";

export function getBaseUrl(req?: NextRequest) {
  // Prefer explicit env in all environments
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL;

  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/$/, "");
  }

  // Fallback from request headers (useful on Vercel / reverse proxies)
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) return `${proto}://${host}`.replace(/\/$/, "");
  }

  // Dev fallback
  return "http://localhost:3000";
}

export function absUrl(path: string, req?: NextRequest) {
  const base = getBaseUrl(req);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
