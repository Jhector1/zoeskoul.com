import "server-only";

import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

const CODE_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

export function createPracticeChallengeCode() {
  return crypto.randomBytes(7).toString("base64url");
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

export async function getActivePracticeChallengeLink(codeValue: unknown) {
  const code = normalizePracticeChallengeCode(codeValue);
  if (!code) return null;

  return prisma.practiceChallengeLink.findFirst({
    where: {
      code,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}
