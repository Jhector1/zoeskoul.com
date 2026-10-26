import { NextResponse, type NextRequest } from "next/server";
import {
  HANDOFF_COOKIE, SESSION_COOKIE, SESSION_SECONDS, constantTimeEqual,
  exchangeHandoff, isOpaque, randomOpaque, readBuilderSession,
  requireHandoffOrigins, revokeBuilderSession, safeReturnPath, sha256,
} from "@/lib/auth/buildHandoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A failed handoff must terminate on a public page, not restart authentication. */
type HandoffFailure =
  | "invalid_request"
  | "exchange_rejected"
  | "authority_unavailable"
  | "session_unavailable";

export async function GET(request: NextRequest) {
  const { zoebuildOrigin } = requireHandoffOrigins();
  const verifier = request.cookies.get(HANDOFF_COOKIE)?.value;
  const ticket = request.nextUrl.searchParams.get("ticket");
  const state = request.nextUrl.searchParams.get("state");
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  const valid = isOpaque(verifier) && isOpaque(ticket) && typeof state === "string" &&
    /^[a-f0-9]{64}$/.test(state) && constantTimeEqual(sha256(verifier), state);

  let sessionToken: string | null = null;
  let failure: HandoffFailure = valid ? "exchange_rejected" : "invalid_request";
  if (valid) {
    try {
      const candidate = randomOpaque();
      if (await exchangeHandoff(ticket, state, candidate)) {
        // A stored session is not enough: verify that the Website authority can
        // resolve it to an authenticated user *before* sending a browser onward.
        const session = await readBuilderSession(candidate);
        if (session.authenticated && session.user?.id) {
          sessionToken = candidate;
        } else {
          failure = "session_unavailable";
          await revokeBuilderSession(candidate);
        }
      }
    } catch {
      // Never log or echo ticket, verifier, state, credentials or session token.
      failure = "authority_unavailable";
    }
  }

  const destination = new URL(
    sessionToken ? returnTo : `/auth/handoff/error?reason=${failure}`,
    zoebuildOrigin,
  );
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(HANDOFF_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
  });
  if (sessionToken) {
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
    });
  } else {
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0,
    });
    console.warn("[zoebuild-auth] handoff terminated", { reason: failure });
  }
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
