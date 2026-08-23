import { NextResponse } from "next/server";
import {
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  hardenApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { resolveRequestWebsiteOrigin } from "@/lib/http/websiteOrigin";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
import { assertPublishedChallengeTargetAvailable } from "@/lib/practice/challenges/publishedAvailability";
import { requireChallengePublisherAccessApi } from "@/lib/practice/challenges/publisherAccess";
import { resolveSharedChallengeTarget } from "@/lib/practice/challenges/target";
import { signSharedChallenge } from "@/lib/practice/challenges/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publisherBrowserResponse(
  request: Request,
  response: Response,
) {
  return applyAppCorsHeaders(
    request,
    hardenApiResponse(response),
  );
}

const BodySchema = z.object({
  locale: z.enum(["en", "fr", "ht"]).default("en"),
  subjectSlug: z.string().trim().min(1).max(180),
  moduleSlug: z.string().trim().min(1).max(180),
  sectionSlug: z.string().trim().min(1).max(220),
  topicSlug: z.string().trim().min(1).max(220),
  exerciseKey: z.string().trim().min(1).max(260),
});

const PREVIEW_TTL_MINUTES = 15;

export async function POST(req: Request) {
  const { denied } = await requireChallengePublisherAccessApi();
  if (denied) return publisherBrowserResponse(req,denied);

  if (!isAppOriginAllowed(req)) {
    return publisherBrowserResponse(req,
      NextResponse.json({ error: "Invalid request origin." }, { status: 403 }),
    );
  }

  const parsed = BodySchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) {
    return publisherBrowserResponse(req,
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

    return publisherBrowserResponse(req,
      NextResponse.json({
        ok: true,
        url: `${resolveRequestWebsiteOrigin(req)}${path}?${query.toString()}`,
        title: target.exerciseTitle,
        expiresAt: expiresAt.toISOString(),
      }),
    );
  } catch (error) {
    return publisherBrowserResponse(req,
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


export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
