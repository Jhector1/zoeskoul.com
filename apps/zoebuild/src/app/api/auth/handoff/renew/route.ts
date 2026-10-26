import { NextResponse, type NextRequest } from "next/server";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { SESSION_COOKIE, SESSION_SECONDS, renewBuilderSession } from "@/lib/auth/buildHandoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
/** Refresh Web-owned Redis lease + host-only cookie together, never independently. */
export async function POST(request: NextRequest) {
  if (!enforceSameOriginPost(request))
    return NextResponse.json({ ok: false, code: "SESSION_FORBIDDEN" }, { status: 403, headers });
  const result = await renewBuilderSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (result.kind === "unavailable")
    return NextResponse.json({ ok: false, code: "SESSION_AUTHORITY_UNAVAILABLE" }, { status: 503, headers });
  if (result.kind === "expired") {
    // Keep the stale cookie until a user-initiated handoff: protected pages
    // use its presence to terminate (rather than loop) on an invalid session.
    return NextResponse.json({ ok: false, code: "SESSION_EXPIRED" }, { status: 401, headers });
  }
  const response = NextResponse.json(result.session, { headers });
  response.cookies.set(SESSION_COOKIE, request.cookies.get(SESSION_COOKIE)!.value, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
  });
  return response;
}
