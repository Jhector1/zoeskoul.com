import { NextResponse } from "next/server";
import { z } from "zod";

import {
  cloudinaryServerImageUrl,
  destroyCloudinaryImage,
  uploadChallengeOgImage,
} from "@/lib/cloudinary/server";
import { prisma } from "@/lib/prisma";
import {
  enforceSameOriginPost,
  hardenApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { assertEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";
import { assertPublishedChallengeTargetAvailable } from "@/lib/practice/challenges/publishedAvailability";
import { requireChallengePublisherAccessApi } from "@/lib/practice/challenges/publisherAccess";
import {
  createPracticeChallengeCode,
  practiceChallengePath,
} from "@/lib/practice/challenges/shortLink";
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
  shareTitle: z.string().trim().min(1).max(100).optional(),
  shareDescription: z.string().trim().min(1).max(240).optional(),
  ogImageAlt: z.string().trim().min(1).max(160).optional(),
});

type ParsedShareRequest = {
  raw: unknown;
  image: File | null;
};

class ChallengeLinkPersistenceError extends Error {
  constructor(cause?: unknown) {
    super("Could not save the challenge link.", { cause });
    this.name = "ChallengeLinkPersistenceError";
  }
}

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

function optionalFormValue(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

async function readShareRequest(req: Request): Promise<ParsedShareRequest> {
  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase();

  if (!contentType.includes("multipart/form-data")) {
    return { raw: await readJsonSafe(req), image: null };
  }

  const form = await req.formData();
  const imageValue = form.get("image");

  return {
    raw: {
      locale: optionalFormValue(form, "locale") ?? "en",
      subjectSlug: optionalFormValue(form, "subjectSlug"),
      moduleSlug: optionalFormValue(form, "moduleSlug"),
      sectionSlug: optionalFormValue(form, "sectionSlug"),
      topicSlug: optionalFormValue(form, "topicSlug"),
      exerciseKey: optionalFormValue(form, "exerciseKey"),
      shareTitle: optionalFormValue(form, "shareTitle"),
      shareDescription: optionalFormValue(form, "shareDescription"),
      ogImageAlt: optionalFormValue(form, "ogImageAlt"),
    },
    image:
      imageValue instanceof File && imageValue.size > 0 ? imageValue : null,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function createChallengeLinkRecord(input: {
  locale: "en" | "fr" | "ht";
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  signedToken: string;
  shareTitle: string;
  shareDescription: string;
  ogImagePublicId: string | null;
  ogImageAlt: string | null;
  createdById: string | null;
  expiresAt: Date;
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await prisma.practiceChallengeLink.create({
        data: {
          code: createPracticeChallengeCode(),
          locale: input.locale,
          subjectSlug: input.subjectSlug,
          moduleSlug: input.moduleSlug,
          sectionSlug: input.sectionSlug,
          topicSlug: input.topicSlug,
          exerciseKey: input.exerciseKey,
          exercisePurpose: "project",
          signedToken: input.signedToken,
          shareTitle: input.shareTitle,
          shareDescription: input.shareDescription,
          ogImagePublicId: input.ogImagePublicId,
          ogImageAlt: input.ogImageAlt,
          createdById: input.createdById,
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < 5) continue;
      throw new ChallengeLinkPersistenceError(error);
    }
  }

  throw new Error("Could not allocate a unique challenge code.");
}

export async function POST(req: Request) {
  const { access, denied } = await requireChallengePublisherAccessApi();
  if (denied) return hardenApiResponse(denied);

  if (!enforceSameOriginPost(req)) {
    return hardenApiResponse(
      NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    );
  }

  let request: ParsedShareRequest;
  try {
    request = await readShareRequest(req);
  } catch {
    return hardenApiResponse(
      NextResponse.json({ error: "Invalid challenge request." }, { status: 400 }),
    );
  }

  const parsed = BodySchema.safeParse(request.raw);

  if (!parsed.success) {
    return hardenApiResponse(
      NextResponse.json(
        { error: "Invalid challenge target.", issues: parsed.error.issues },
        { status: 400 },
      ),
    );
  }

  let uploadedPublicId: string | null = null;
  let linkCreated = false;

  try {
    const target = resolveSharedChallengeTarget(parsed.data);
    assertEligiblePublicChallengeTarget(target);
    await assertPublishedChallengeTargetAvailable({ prisma, target });

    const expiresAt = new Date(
      Date.now() + challengeTtlDays() * 24 * 60 * 60 * 1000,
    );
    const token = signSharedChallenge(target, { expiresAt });
    const defaultDescription =
      "Can you complete this coding project challenge? No account is required to try it.";
    const shareTitle = parsed.data.shareTitle ?? target.exerciseTitle;
    const shareDescription = parsed.data.shareDescription ?? defaultDescription;

    if (request.image) {
      const uploaded = await uploadChallengeOgImage(request.image);
      uploadedPublicId = uploaded.publicId;
    }

    const link = await createChallengeLinkRecord({
      locale: parsed.data.locale,
      subjectSlug: target.subjectSlug,
      moduleSlug: target.moduleSlug,
      sectionSlug: target.sectionSlug,
      topicSlug: target.topicSlug,
      exerciseKey: target.exerciseKey,
      signedToken: token,
      shareTitle,
      shareDescription,
      ogImagePublicId: uploadedPublicId,
      ogImageAlt:
        uploadedPublicId !== null
          ? parsed.data.ogImageAlt ?? `${shareTitle} challenge preview`
          : null,
      createdById: access.userId,
      expiresAt,
    });

    linkCreated = true;

    const shortPath = `/${encodeURIComponent(parsed.data.locale)}${practiceChallengePath(
      link.code,
    )}`;
    const url = `${publicOrigin(req)}${shortPath}`;
    const imageUrl = uploadedPublicId
      ? cloudinaryServerImageUrl(uploadedPublicId, {
          w: 1200,
          h: 630,
          crop: "fill",
          gravity: "auto",
          quality: "auto",
          format: "jpg",
        })
      : null;

    return hardenApiResponse(
      NextResponse.json(
        {
          ok: true,
          url,
          code: link.code,
          title: target.exerciseTitle,
          shareTitle,
          shareDescription,
          imageUrl,
          exerciseKey: target.exerciseKey,
          exerciseKind: target.exerciseKind,
          exercisePurpose: target.exercisePurpose,
          expiresAt: expiresAt.toISOString(),
          maxAttempts: null,
          attemptPolicy: "unlimited",
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (uploadedPublicId && !linkCreated) {
      await destroyCloudinaryImage(uploadedPublicId).catch((cleanupError) => {
        console.error("[challenge-link] failed to clean up uploaded image", cleanupError);
      });
    }

    const persistenceFailure = error instanceof ChallengeLinkPersistenceError;
    if (persistenceFailure) {
      console.error("[challenge-link] persistence failed", error.cause ?? error);
    }

    return hardenApiResponse(
      NextResponse.json(
        {
          error: persistenceFailure
            ? "Could not save the challenge link."
            : error instanceof Error
              ? error.message
              : "Could not create the challenge link.",
        },
        { status: persistenceFailure ? 500 : 400 },
      ),
    );
  }
}
