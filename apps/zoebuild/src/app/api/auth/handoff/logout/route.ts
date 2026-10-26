import { NextResponse, type NextRequest } from "next/server";
import { buildLogoutUrl } from "@zoeskoul/auth-client";
import { HANDOFF_COOKIE, SESSION_COOKIE, requireHandoffOrigins, revokeBuilderSession } from "@/lib/auth/buildHandoff";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  let websiteOrigin: string;
  try { ({ websiteOrigin } = requireHandoffOrigins()); }
  catch { return new Response("Logout authority unavailable", { status: 503 }); }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  // Do not indicate global sign-out if central revocation failed.
  if (!(await revokeBuilderSession(session))) return new Response("Logout temporarily unavailable", { status: 503 });
  const locale = request.nextUrl.searchParams.get("locale") || "en";
  const response = NextResponse.redirect(buildLogoutUrl({ websiteOrigin, locale }), 303);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(HANDOFF_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
