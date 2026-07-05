import type { Prisma } from "@/lib/prisma";
import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { SharedChallengePurpose } from "./target";

export const SHARED_CHALLENGE_MAX_ATTEMPTS = null;

export type SharedChallengeSessionMeta = {
  kind: "shared_challenge";
  challengeId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exerciseTitle: string;
  exercisePurpose: SharedChallengePurpose;
  maxAttempts: null;
  locale: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPurpose(
  record: Record<string, unknown>,
): SharedChallengePurpose {
  return record.exercisePurpose === "project" ? "project" : "quiz";
}

export function readSharedChallengeMeta(
  meta: unknown,
): SharedChallengeSessionMeta | null {
  const record = asRecord(meta);
  if (!record || record.kind !== "shared_challenge") return null;

  const challengeId = readString(record, "challengeId");
  const subjectSlug = readString(record, "subjectSlug");
  const moduleSlug = readString(record, "moduleSlug");
  const sectionSlug = readString(record, "sectionSlug");
  const topicSlug = readString(record, "topicSlug");
  const exerciseKey = readString(record, "exerciseKey");
  const exerciseTitleValue = readString(record, "exerciseTitle");
  const locale = readString(record, "locale") ?? "en";

  if (
    !challengeId ||
    !subjectSlug ||
    !moduleSlug ||
    !sectionSlug ||
    !topicSlug ||
    !exerciseKey
  ) {
    return null;
  }

  return {
    kind: "shared_challenge",
    challengeId,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicSlug,
    exerciseKey,
    exerciseTitle: exerciseTitleValue ?? exerciseKey,
    exercisePurpose: readPurpose(record),
    maxAttempts: SHARED_CHALLENGE_MAX_ATTEMPTS,
    locale,
  };
}

export function buildSharedChallengeMeta(args: {
  challengeId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
  exerciseTitle: string;
  exercisePurpose: SharedChallengePurpose;
  locale: string;
}): Prisma.InputJsonValue {
  return {
    kind: "shared_challenge",
    challengeId: args.challengeId,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    topicSlug: args.topicSlug,
    exerciseKey: args.exerciseKey,
    exerciseTitle: args.exerciseTitle,
    exercisePurpose: args.exercisePurpose,
    maxAttempts: SHARED_CHALLENGE_MAX_ATTEMPTS,
    locale: args.locale,
  };
}

export function applySharedChallengeParams(
  params: GetParams,
  meta: unknown,
): GetParams {
  const challenge = readSharedChallengeMeta(meta);
  if (!challenge) return params;

  return {
    ...params,
    subject: challenge.subjectSlug,
    module: challenge.moduleSlug,
    section: challenge.sectionSlug,
    topic: challenge.topicSlug,
    exerciseKey: challenge.exerciseKey,
    preferPurpose: challenge.exercisePurpose,
    purposePolicy: "strict",
    seedPolicy: "global",
    salt: `challenge:${challenge.challengeId}`,
    allowReveal: "true",
  };
}

export function getSessionMaxAttempts(_meta: unknown) {
  // Public challenges are intentionally unlimited. Old session metadata may
  // still contain a finite maxAttempts value; ignore it so existing links
  // receive the current policy immediately.
  return null;
}
