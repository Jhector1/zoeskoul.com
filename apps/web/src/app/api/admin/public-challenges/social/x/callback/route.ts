import {
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";
import { NextRequest, NextResponse } from "next/server";

import {
  PUBLIC_CHALLENGE_X_OAUTH_COOKIE,
  completePublicChallengeXAuthorization,
} from "@/lib/marketing/publicChallengeSocialXAuth";
import {
  resolveChallengePublisherAccess,
} from "@/lib/practice/challenges/publisherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearOAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: PUBLIC_CHALLENGE_X_OAUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin/public-challenges/social/x",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 },
      ),
    );
  }
  if (!access.allowed) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: "Publisher access required." },
        { status: 403 },
      ),
    );
  }

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return clearOAuthCookie(
      NextResponse.json(
        {
          error: `X authorization was not completed: ${providerError}`,
        },
        { status: 400 },
      ),
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  const cookieValue =
    request.cookies.get(PUBLIC_CHALLENGE_X_OAUTH_COOKIE)?.value || "";

  if (!code || !state || !cookieValue) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: "X OAuth callback is missing required state." },
        { status: 400 },
      ),
    );
  }

  try {
    await completePublicChallengeXAuthorization({
      code,
      state,
      cookieValue,
    });

    const adminOrigin =
      process.env.NODE_ENV === "development"
        ? getLocalAppOrigin("admin")
        : getProductionAppOrigin("admin");
    const target = new URL("/public-challenges", adminOrigin);
    target.searchParams.set("xOAuth", "connected");

    return clearOAuthCookie(NextResponse.redirect(target));
  } catch (error) {
    return clearOAuthCookie(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not complete X authorization.",
        },
        { status: 400 },
      ),
    );
  }
}
