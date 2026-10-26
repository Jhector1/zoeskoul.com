import { NextResponse, type NextRequest } from "next/server";
import { HANDOFF_COOKIE, randomOpaque, requireHandoffOrigins, safeReturnPath, sha256 } from "@/lib/auth/buildHandoff";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { websiteOrigin, zoebuildOrigin } = requireHandoffOrigins();
    // Fixed Web login authority; client never supplies a website redirect origin.
    const verifier = randomOpaque();
    const state = sha256(verifier);
    const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
    const locale = request.nextUrl.searchParams.get("locale");
    const lang = locale === "fr" || locale === "ht" || locale === "es" ? locale : "en";
    // The verifier is a __Host- cookie, so it MUST be issued on the same
    // canonical origin to which Web sends the callback. Starting a handoff on
    // localhost and completing it on dev-build (or vice versa) loses the cookie.
    // Normalize BEFORE minting the verifier cookie, with a fixed trusted target.
    const canonicalBuilderOrigin = new URL(zoebuildOrigin).origin;
    if (request.nextUrl.origin !== canonicalBuilderOrigin) {
      const canonicalStart = new URL("/api/auth/handoff/start", canonicalBuilderOrigin);
      canonicalStart.searchParams.set("returnTo", returnTo);
      canonicalStart.searchParams.set("locale", lang);
      const relocated = NextResponse.redirect(canonicalStart, 303);
      relocated.headers.set("Cache-Control", "no-store");
      relocated.headers.set("Referrer-Policy", "no-referrer");
      // A redirect across hosts must not issue a verifier for the wrong host.
      return relocated;
    }
    const issuer = new URL("/api/auth/build-handoff/issue", websiteOrigin);
    issuer.searchParams.set("state", state);
    issuer.searchParams.set("returnTo", returnTo);
    const login = new URL(`/${lang}/authenticate`, websiteOrigin);
    login.searchParams.set("callbackUrl", issuer.toString());
    const response = NextResponse.redirect(login, 303);
    response.cookies.set(HANDOFF_COOKIE, verifier, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 300,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return new Response("Authentication handoff unavailable", { status: 503 }); }
}
