import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  enforceSameOriginPost,
  hardenApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { requireChallengePublisherApi } from "@/lib/practice/challenges/publisherAccess";
import { assertPublishedChallengeTargetAvailable } from "@/lib/practice/challenges/publishedAvailability";
import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import { signSharedChallenge } from "@/lib/practice/challenges/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  locale: z.enum(["en", "fr", "ht"]).default("en"),
  subjectSlug: z.string().trim().min(1).max(180),
  moduleSlug: z.string().trim().min(1).max(180),
  sectionSlug: z.string().trim().min(1).max(220),
  topicSlug: z.string().trim().min(1).max(220),
  exerciseKey: z.string().trim().min(1).max(260),
});

function challengeTtlDays() {
  const raw = Number(process.env.CHALLENGE_LINK_TTL_DAYS ?? "365");
  if (!Number.isFinite(raw) || raw <= 0) return 365;
  return Math.max(1, Math.min(Math.floor(raw), 3650));
}

function publicOrigin(req: Request) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();

  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      // Fall back to the request origin below.
    }
  }

  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const denied = await requireChallengePublisherApi();
  if (denied) return hardenApiResponse(denied);

  if (!enforceSameOriginPost(req)) {
    return hardenApiResponse(
      NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    );
  }

  const raw = await readJsonSafe(req);
  const parsed = BodySchema.safeParse(raw);

  if (!parsed.success) {
    return hardenApiResponse(
      NextResponse.json(
        { error: "Invalid challenge target.", issues: parsed.error.issues },
        { status: 400 },
      ),
    );
  }

  try {
    const target = resolveSharedChallengeTarget(parsed.data);
    await assertPublishedChallengeTargetAvailable({ prisma, target });

    const expiresAt = new Date(
      Date.now() + challengeTtlDays() * 24 * 60 * 60 * 1000,
    );

    const token = signSharedChallenge(target, { expiresAt });
    const path = `/${encodeURIComponent(parsed.data.locale)}/practice/trial`;
    const query = new URLSearchParams({ challenge: token });
    const url = `${publicOrigin(req)}${path}?${query.toString()}`;

    return hardenApiResponse(
      NextResponse.json({
        ok: true,
        url,
        title: target.exerciseTitle,
        exerciseKey: target.exerciseKey,
        exerciseKind: target.exerciseKind,
        exercisePurpose: target.exercisePurpose,
        expiresAt: expiresAt.toISOString(),
        maxAttempts: null,
        attemptPolicy: "unlimited",
      }),
    );
  } catch (error) {
    return hardenApiResponse(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not create the challenge link.",
        },
        { status: 400 },
      ),
    );
  }
}
