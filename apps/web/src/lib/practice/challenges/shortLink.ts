import "server-only";

import crypto from "node:crypto";
import { prisma, type Prisma } from "@/lib/prisma";

const CODE_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

export function createPracticeChallengeCode() {
  return crypto.randomBytes(7).toString("base64url");
}

export class ChallengeLinkPersistenceError extends Error {
  constructor(cause?: unknown) {
    super("Could not save the challenge link.", { cause });
    this.name = "ChallengeLinkPersistenceError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export type CreatePracticeChallengeLinkRecordInput = {
  locale: "en" | "fr" | "ht";
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exercisePurpose: "practice";
  signedToken: string;
  shareTitle: string;
  shareDescription: string;
  ogImagePublicId: string | null;
  ogImageAlt: string | null;
  createdById: string | null;
  expiresAt: Date | null;
};

export async function createPracticeChallengeLinkRecord(
  input: CreatePracticeChallengeLinkRecordInput,
) {
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
          exercisePurpose: input.exercisePurpose,
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

export function practiceChallengeLinkExpiresAt(now = new Date()) {
  const raw = Number(process.env.CHALLENGE_LINK_TTL_DAYS ?? "365");
  const ttlDays =
    Number.isFinite(raw) && raw > 0
      ? Math.max(1, Math.min(Math.floor(raw), 3650))
      : 365;

  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export function normalizePracticeChallengeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return CODE_PATTERN.test(code) ? code : null;
}

export function practiceChallengePath(code: string) {
  const normalized = normalizePracticeChallengeCode(code);
  if (!normalized) throw new Error("Invalid challenge code.");
  return `/c/${encodeURIComponent(normalized)}`;
}

function activePracticeChallengeWhere(
  now = new Date(),
): Prisma.PracticeChallengeLinkWhereInput {
  return {
    exercisePurpose: "practice",
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function getActivePracticeChallengeLink(codeValue: unknown) {
  const code = normalizePracticeChallengeCode(codeValue);
  if (!code) return null;

  return prisma.practiceChallengeLink.findFirst({
    where: {
      code,
      ...activePracticeChallengeWhere(),
    },
  });
}

export async function getLatestActivePracticeChallengeLink(
  locale?: string,
  options?: {
    excludeIds?: readonly string[];
  },
) {
  const activeWhere = activePracticeChallengeWhere();
  const normalizedLocale = String(locale ?? "").trim();
  const excludeIds = [
    ...new Set(
      (options?.excludeIds ?? [])
        .map((id) => String(id).trim())
        .filter(Boolean),
    ),
  ];
  const exclusion =
    excludeIds.length > 0
      ? {
          id: {
            notIn: excludeIds,
          },
        }
      : {};

  if (normalizedLocale) {
    const localized = await prisma.practiceChallengeLink.findFirst({
      where: {
        ...activeWhere,
        ...exclusion,
        locale: normalizedLocale,
      },
      orderBy: { createdAt: "desc" },
    });

    if (localized) return localized;
  }

  return prisma.practiceChallengeLink.findFirst({
    where: {
      ...activeWhere,
      ...exclusion,
    },
    orderBy: { createdAt: "desc" },
  });
}
