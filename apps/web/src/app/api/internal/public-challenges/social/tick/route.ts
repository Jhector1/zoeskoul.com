import crypto from "node:crypto";

import {
  runDailyPublicChallengeSocialTick,
} from "@/lib/marketing/publicChallengeSocialAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected =
    process.env.ZOESKOUL_SOCIAL_SCHEDULER_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;

  const actual = header.slice("Bearer ".length).trim();
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);

  return (
    left.length === right.length &&
    crypto.timingSafeEqual(left, right)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  try {
    return Response.json(
      await runDailyPublicChallengeSocialTick(),
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[public-challenge-social-tick] failed", error);
    return Response.json(
      { error: "Daily social challenge tick failed." },
      { status: 500 },
    );
  }
}
