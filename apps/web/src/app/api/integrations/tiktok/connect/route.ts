import { randomBytes } from "node:crypto";

import { getProductionAppOrigin } from "@zoeskoul/app-config";
import { NextRequest, NextResponse } from "next/server";

import {
  buildTikTokPublisherAuthorizationUrl,
} from "@/lib/marketing/publicChallengeTikTokConnection";
import {
  resolveChallengePublisherAccess,
} from "@/lib/practice/challenges/publisherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const TIKTOK_OAUTH_STATE_COOKIE = "__Host-zoeskoul-tiktok-oauth-state";

export async function GET(_request: NextRequest) {
  const access = await resolveChallengePublisherAccess();
  const origin = getProductionAppOrigin("website");

  if (!access.authenticated) {
    const login = new URL("/en/authenticate", origin);
    login.searchParams.set("callbackUrl", "/api/integrations/tiktok/connect");
    return NextResponse.redirect(login);
  }
  if (!access.allowed || !access.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(
    buildTikTokPublisherAuthorizationUrl({ state }),
  );
  response.cookies.set(TIKTOK_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
