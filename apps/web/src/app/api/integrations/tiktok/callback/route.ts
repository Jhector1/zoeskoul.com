import { getProductionAppOrigin } from "@zoeskoul/app-config";
import { NextRequest, NextResponse } from "next/server";

import {
  persistTikTokPublisherAuthorization,
} from "@/lib/marketing/publicChallengeTikTokConnection";
import {
  resolveChallengePublisherAccess,
} from "@/lib/practice/challenges/publisherAccess";
import {
  TIKTOK_OAUTH_STATE_COOKIE,
} from "../connect/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function destination(status: string) {
  const url = new URL(
    "/en/admin/public-challenges",
    getProductionAppOrigin("website"),
  );
  url.searchParams.set("tiktok", status);
  return url;
}

function redirectAndClear(status: string) {
  const response = NextResponse.redirect(destination(status));
  response.cookies.set(TIKTOK_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const expectedState =
    request.cookies.get(TIKTOK_OAUTH_STATE_COOKIE)?.value ?? "";
  const returnedState = request.nextUrl.searchParams.get("state") ?? "";

  if (!expectedState || !returnedState || expectedState !== returnedState) {
    return redirectAndClear("state-error");
  }

  if (request.nextUrl.searchParams.get("error")) {
    return redirectAndClear("denied");
  }

  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!code) return redirectAndClear("missing-code");

  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated || !access.allowed || !access.userId) {
    return redirectAndClear("forbidden");
  }

  try {
    await persistTikTokPublisherAuthorization({
      userId: access.userId,
      code,
    });
    return redirectAndClear("connected");
  } catch (error) {
    console.error("[tiktok-oauth] callback failed", error);
    return redirectAndClear("error");
  }
}
