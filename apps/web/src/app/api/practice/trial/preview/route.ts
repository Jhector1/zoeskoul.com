import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  enforceSameOriginPost,
  hardenApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
import { assertPublishedChallengeTargetAvailable } from "@/lib/practice/challenges/publishedAvailability";
import { requireChallengePublisherAccessApi } from "@/lib/practice/challenges/publisherAccess";
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

const PREVIEW_TTL_MINUTES = 15;

function requestOrigin(req: Request) {
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const { denied } = await requireChallengePublisherAccessApi();
  if (denied) return hardenApiResponse(denied);

  if (!enforceSameOriginPost(req)) {
    return hardenApiResponse(
      NextResponse.json({ error: "Invalid request origin." }, { status: 403 }),
    );
  }

  const parsed = BodySchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) {
    return hardenApiResponse(
      NextResponse.json({ error: "Invalid preview request." }, { status: 400 }),
    );
  }

  try {
    const target = resolveSharedChallengeTarget(parsed.data);
    assertEligiblePublicChallengeTarget(target);
    await assertPublishedChallengeTargetAvailable({ prisma, target });

    const expiresAt = new Date(
      Date.now() + PREVIEW_TTL_MINUTES * 60 * 1000,
    );
    const challenge = signSharedChallenge(target, { expiresAt });
    const path = `/${encodeURIComponent(parsed.data.locale)}/practice/trial`;
    const query = new URLSearchParams({
      challenge,
      publisherPreview: "1",
    });

    return hardenApiResponse(
      NextResponse.json({
        ok: true,
        url: `${requestOrigin(req)}${path}?${query.toString()}`,
        title: target.exerciseTitle,
        expiresAt: expiresAt.toISOString(),
      }),
    );
  } catch (error) {
    return hardenApiResponse(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not create the exercise preview.",
        },
        { status: 400 },
      ),
    );
  }
}
