import { NextResponse } from "next/server";

import {
  PUBLIC_CHALLENGE_X_OAUTH_COOKIE,
  createPublicChallengeXAuthorizationRequest,
} from "@/lib/marketing/publicChallengeSocialXAuth";
import {
  resolveChallengePublisherAccess,
} from "@/lib/practice/challenges/publisherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Publisher access required." },
      { status: 403 },
    );
  }

  try {
    const oauth = createPublicChallengeXAuthorizationRequest();
    const response = NextResponse.redirect(oauth.authorizationUrl);
    response.cookies.set({
      name: PUBLIC_CHALLENGE_X_OAUTH_COOKIE,
      value: oauth.cookieValue,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/admin/public-challenges/social/x",
      maxAge: oauth.cookieMaxAge,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not start X authorization.",
      },
      { status: 500 },
    );
  }
}
