import type { Prisma } from "@/lib/prisma";
import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  applyAuthoredPracticeTarget,
  authoredPracticeTargetFromOption,
  authoredPracticeTargetIdentity,
  normalizeAuthoredPracticeQueue,
  resolveNextAuthoredPracticeTarget,
  type AuthoredPracticeTarget,
} from "./authoredPracticeQueue";
import { resolveAvailablePracticeTargetCount } from "./availableTargetCount";

export type SubscriberPracticeScope = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
};

export type SubscriberPracticeSessionMeta = {
  kind: "subscriber_practice";
  queue: AuthoredPracticeTarget[];
  targetCount: number;
  lastOpenedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Subscriber practice can use every independently authored lesson exercise.
 * Module projects and capstones stay out because their steps depend on a
 * cumulative workspace rather than a fresh practice session.
 */
export function isSubscriberPracticeEligible(
  option: PublishedPracticeExerciseOption,
) {
  return option.sectionRole === "lesson";
}

export function pickSubscriberPracticeQueue(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  targetCount: number;
}) {
  const unique = new Map<string, PublishedPracticeExerciseOption>();

  for (const option of args.options) {
    if (!isSubscriberPracticeEligible(option)) continue;
    if (option.subjectSlug !== args.subjectSlug) continue;
    if (option.moduleSlug !== args.moduleSlug) continue;
    if (option.sectionSlug !== args.sectionSlug) continue;
    if (option.topicSlug !== args.topicSlug) continue;

    const identity = authoredPracticeTargetIdentity(
      authoredPracticeTargetFromOption(option),
    );
    if (!unique.has(identity)) unique.set(identity, option);
  }

  const pool = [...unique.values()];
  const effectiveTargetCount = resolveAvailablePracticeTargetCount({
    requested: args.targetCount,
    available: pool.length,
    fallback: args.targetCount,
  });
  if (effectiveTargetCount === 0) return [];

  // Preserve authored order while alternating hands-on and knowledge checks.
  // A topic with only one kind still uses every available item up to the limit.
  const practical = pool.filter((option) => option.exercisePurpose !== "quiz");
  const quizzes = pool.filter((option) => option.exercisePurpose === "quiz");
  const selected: PublishedPracticeExerciseOption[] = [];
  let practicalIndex = 0;
  let quizIndex = 0;

  while (selected.length < effectiveTargetCount) {
    let added = false;

    if (practicalIndex < practical.length) {
      selected.push(practical[practicalIndex]);
      practicalIndex += 1;
      added = true;
    }
    if (selected.length >= effectiveTargetCount) break;

    if (quizIndex < quizzes.length) {
      selected.push(quizzes[quizIndex]);
      quizIndex += 1;
      added = true;
    }

    if (!added) break;
  }

  return selected
    .slice(0, effectiveTargetCount)
    .map(authoredPracticeTargetFromOption);
}

export function buildSubscriberPracticeMeta(args: {
  queue: AuthoredPracticeTarget[];
  lastOpenedAt?: Date | string;
}): Prisma.InputJsonValue {
  const openedAt =
    args.lastOpenedAt instanceof Date
      ? args.lastOpenedAt.toISOString()
      : String(args.lastOpenedAt ?? new Date().toISOString());

  return {
    kind: "subscriber_practice",
    queue: args.queue,
    targetCount: args.queue.length,
    lastOpenedAt: openedAt,
  };
}

export function readSubscriberPracticeMeta(
  meta: unknown,
): SubscriberPracticeSessionMeta | null {
  const record = asRecord(meta);
  if (!record || record.kind !== "subscriber_practice") return null;

  const queue = normalizeAuthoredPracticeQueue(record.queue);
  const targetCount = Math.max(0, Math.floor(Number(record.targetCount ?? 0)));
  if (targetCount <= 0 || queue.length !== targetCount) return null;

  const rawLastOpenedAt = String(record.lastOpenedAt ?? "").trim();
  const lastOpenedAt = Number.isNaN(Date.parse(rawLastOpenedAt))
    ? null
    : new Date(rawLastOpenedAt).toISOString();

  return {
    kind: "subscriber_practice",
    queue,
    targetCount,
    lastOpenedAt,
  };
}

export function subscriberPracticeScopeFromMeta(
  meta: unknown,
): SubscriberPracticeScope | null {
  const parsed = readSubscriberPracticeMeta(meta);
  const first = parsed?.queue[0];
  if (!first) return null;

  return {
    subjectSlug: first.subjectSlug,
    moduleSlug: first.moduleSlug,
    sectionSlug: first.sectionSlug,
    topicSlug: first.topicSlug,
  };
}

export function isSameSubscriberPracticeScope(
  left: SubscriberPracticeScope | null | undefined,
  right: SubscriberPracticeScope | null | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.subjectSlug === right.subjectSlug &&
      left.moduleSlug === right.moduleSlug &&
      left.sectionSlug === right.sectionSlug &&
      left.topicSlug === right.topicSlug,
  );
}

export function touchSubscriberPracticeMeta(
  meta: unknown,
  at: Date = new Date(),
): Prisma.InputJsonValue | null {
  const parsed = readSubscriberPracticeMeta(meta);
  if (!parsed) return null;
  return buildSubscriberPracticeMeta({ queue: parsed.queue, lastOpenedAt: at });
}

export function applySubscriberPracticeParams(
  params: GetParams,
  session: {
    id?: string | null;
    meta?: unknown;
    instances?: Array<{
      exerciseKey?: string | null;
      topic?: { slug?: string | null } | null;
    }>;
  } | null | undefined,
): GetParams {
  const meta = readSubscriberPracticeMeta(session?.meta);
  if (!meta) return params;

  const target = resolveNextAuthoredPracticeTarget({
    queue: meta.queue,
    usedTargets: session?.instances ?? [],
  });
  if (!target) return params;

  return applyAuthoredPracticeTarget({
    params,
    target,
    salt: `subscriber-practice:${session?.id ?? "session"}:${target.topicSlug}:${target.exerciseKey}`,
  });
}
