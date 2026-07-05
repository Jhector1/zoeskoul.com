import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachGuestCookie } from "@/lib/practice/actor";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  getClientIp,
  hardenApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { buildTrialStartContext } from "@/lib/practice/api/trial/context";
import { startOrResumePublicChallenge } from "@/lib/practice/api/trial/services/trialStart.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public-link challenges have a dedicated entry point. They are not onboarding trials. */
export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const raw = await readJsonSafe(req);

  const built = await buildTrialStartContext({
    prisma,
    req,
    requestId,
    rawBody: raw,
  });

  if (!built.ok) {
    return hardenApiResponse(
      NextResponse.json(built.body, { status: built.statusCode }),
    );
  }

  const { ctx } = built;
  if (!ctx.body.challenge) {
    return attachGuestCookie(
      hardenApiResponse(
        NextResponse.json(
          { message: "Missing public challenge token.", requestId },
          { status: 400 },
        ),
      ),
      ctx.setGuestId,
    );
  }

  const rl = await rateLimit(`practice-challenge-start:${getClientIp(req)}`);
  if (!rl.ok) {
    return attachGuestCookie(
      hardenApiResponse(
        NextResponse.json(
          { message: "Too many requests.", requestId },
          { status: 429 },
        ),
      ),
      ctx.setGuestId,
    );
  }

  try {
    const out = await startOrResumePublicChallenge(ctx, ctx.body.challenge);
    const res = out.ok
      ? NextResponse.json(out, { status: 200 })
      : NextResponse.json(out.body, { status: out.statusCode });
    return attachGuestCookie(hardenApiResponse(res), ctx.setGuestId);
  } catch (error: any) {
    return attachGuestCookie(
      hardenApiResponse(
        NextResponse.json(
          {
            message: error?.message ?? "Could not start public challenge.",
            requestId,
          },
          { status: 400 },
        ),
      ),
      ctx.setGuestId,
    );
  }
}
