import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/prisma";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import type { GetParams } from "@/lib/practice/api/get/schemas";
import {
  applyAuthoredPracticeTarget,
  authoredPracticeTargetFromOption,
  authoredPracticeTargetIdentity,
  normalizeAuthoredPracticeQueue,
  resolveNextAuthoredPracticeTarget,
  type AuthoredPracticeTarget,
} from "./authoredPracticeQueue";
import { resolveAvailablePracticeTargetCount } from "./availableTargetCount";
import {
  DAILY_PRACTICE_TARGET_COUNT,
  normalizeDailyPracticeTargetCount,
} from "./config";

/** @deprecated Prefer DAILY_PRACTICE_TARGET_COUNT for new code. */
export const DAILY_FIVE_TARGET_COUNT = DAILY_PRACTICE_TARGET_COUNT;
export const DAILY_FIVE_MAX_ATTEMPTS = null;

export type DailyFiveTarget = AuthoredPracticeTarget;

export type DailyFiveSessionMeta = {
  kind: "daily_five";
  dayKey: string;
  locale: string;
  subjectSlug?: string;
  queue: DailyFiveTarget[];
  targetCount: number;
  maxAttempts: null;
};

export type DailyPracticeSubjectOption = {
  subjectSlug: string;
  subjectTitle: string;
  catalogSlug: string;
  catalogTitle: string;
  eligibleExerciseCount: number;
  eligibleModuleCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dailyFiveExperienceKey(userId: string, dayKey: string) {
  return `daily-five:${userId}:${dayKey}`;
}

export function readDailyFiveMeta(meta: unknown): DailyFiveSessionMeta | null {
  const record = asRecord(meta);
  if (!record || record.kind !== "daily_five") return null;

  const dayKey = typeof record.dayKey === "string" ? record.dayKey : "";
  const locale = typeof record.locale === "string" ? record.locale : "en";
  const queue = Array.isArray(record.queue) ? record.queue : [];
  const targetCount = normalizeDailyPracticeTargetCount(
    record.targetCount ?? queue.length,
  );

  if (!dayKey || queue.length !== targetCount) return null;

  const normalized = normalizeAuthoredPracticeQueue(queue);

  if (normalized.length !== targetCount) return null;

  return {
    kind: "daily_five",
    dayKey,
    locale,
    subjectSlug:
      typeof record.subjectSlug === "string" && record.subjectSlug.trim()
        ? record.subjectSlug.trim()
        : normalized[0]?.subjectSlug,
    queue: normalized,
    targetCount,
    // Daily Practice is unlimited. Ignore finite values written by older
    // sessions so an in-progress set receives the current policy immediately.
    maxAttempts: DAILY_FIVE_MAX_ATTEMPTS,
  };
}

export function buildDailyFiveMeta(args: {
  dayKey: string;
  locale: string;
  queue: DailyFiveTarget[];
}): Prisma.InputJsonValue {
  return {
    kind: "daily_five",
    dayKey: args.dayKey,
    locale: args.locale,
    subjectSlug: args.queue[0]?.subjectSlug ?? null,
    queue: args.queue,
    targetCount: args.queue.length,
    maxAttempts: DAILY_FIVE_MAX_ATTEMPTS,
  };
}

export function isDailyFiveEligible(option: PublishedPracticeExerciseOption) {
  return (
    option.exerciseKind === "code_input" &&
    option.isStandaloneTryIt === true &&
    option.sectionRole === "lesson" &&
    option.exercisePurpose !== "quiz" &&
    option.isMultiFile !== true &&
    option.requiresTerminal !== true
  );
}

function score(seed: string, option: PublishedPracticeExerciseOption) {
  return createHash("sha256")
    .update(`${seed}|${option.id}`)
    .digest("hex");
}

export function listDailyPracticeSubjectOptions(args: {
  options: PublishedPracticeExerciseOption[];
  targetCount?: number;
}): DailyPracticeSubjectOption[] {
  const bySubject = new Map<
    string,
    {
      subjectTitle: string;
      catalogSlug: string;
      catalogTitle: string;
      exercises: Set<string>;
      modules: Set<string>;
    }
  >();

  for (const option of args.options) {
    if (!isDailyFiveEligible(option)) continue;

    const current = bySubject.get(option.subjectSlug) ?? {
      subjectTitle: option.subjectTitle,
      catalogSlug: option.catalogSlug,
      catalogTitle: option.catalogTitle,
      exercises: new Set<string>(),
      modules: new Set<string>(),
    };

    current.exercises.add(
      authoredPracticeTargetIdentity(authoredPracticeTargetFromOption(option)),
    );
    current.modules.add(option.moduleSlug);
    bySubject.set(option.subjectSlug, current);
  }

  return [...bySubject.entries()]
    .map(([subjectSlug, value]) => ({
      subjectSlug,
      subjectTitle: value.subjectTitle,
      catalogSlug: value.catalogSlug,
      catalogTitle: value.catalogTitle,
      eligibleExerciseCount: value.exercises.size,
      eligibleModuleCount: value.modules.size,
    }))
    .filter((subject) => subject.eligibleExerciseCount > 0)
    .sort(
      (a, b) =>
        a.catalogTitle.localeCompare(b.catalogTitle) ||
        a.subjectTitle.localeCompare(b.subjectTitle) ||
        a.subjectSlug.localeCompare(b.subjectSlug),
    );
}

function uniqueEligibleOptions(options: PublishedPracticeExerciseOption[]) {
  const unique = new Map<string, PublishedPracticeExerciseOption>();

  for (const option of options) {
    const key = authoredPracticeTargetIdentity(
      authoredPracticeTargetFromOption(option),
    );
    if (!unique.has(key)) unique.set(key, option);
  }

  return [...unique.values()];
}

function deterministicOrder(
  seed: string,
  options: PublishedPracticeExerciseOption[],
) {
  return [...options].sort((a, b) =>
    score(seed, a).localeCompare(score(seed, b)),
  );
}

/**
 * Build one deterministic daily queue for the selected subject.
 *
 * The queue is intentionally not pinned to one module. It round-robins across
 * eligible modules so a learner who chooses Python does not receive a session
 * that is permanently tied to one arbitrarily selected module. The session
 * still stores the first target as its database anchor; every queued target is
 * resolved from the server-authored daily metadata.
 */
export function pickDailyFiveQueue(args: {
  options: PublishedPracticeExerciseOption[];
  userId: string;
  dayKey: string;
  subjectSlug?: string | null;
  moduleSlug?: string | null;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount?: number;
}): DailyFiveTarget[] {
  const targetCount = normalizeDailyPracticeTargetCount(
    args.targetCount ?? DAILY_PRACTICE_TARGET_COUNT,
  );
  const eligible = uniqueEligibleOptions(
    args.options.filter((option) => {
      if (!isDailyFiveEligible(option)) return false;
      if (args.subjectSlug && option.subjectSlug !== args.subjectSlug) return false;
      if (args.moduleSlug && option.moduleSlug !== args.moduleSlug) return false;
      return true;
    }),
  );

  const bySubject = new Map<string, PublishedPracticeExerciseOption[]>();
  for (const option of eligible) {
    const rows = bySubject.get(option.subjectSlug) ?? [];
    rows.push(option);
    bySubject.set(option.subjectSlug, rows);
  }

  const subjectCandidates = [...bySubject.entries()]
    .filter(([, rows]) => rows.length > 0)
    .sort(([subjectA, rowsA], [subjectB, rowsB]) =>
      score(`${args.userId}|${args.dayKey}|subject`, {
        ...rowsA[0],
        id: subjectA,
      }).localeCompare(
        score(`${args.userId}|${args.dayKey}|subject`, {
          ...rowsB[0],
          id: subjectB,
        }),
      ),
    );

  const pool = subjectCandidates[0]?.[1] ?? [];
  const effectiveTargetCount = resolveAvailablePracticeTargetCount({
    requested: targetCount,
    available: pool.length,
    fallback: DAILY_PRACTICE_TARGET_COUNT,
  });
  if (effectiveTargetCount === 0) return [];

  if (args.sectionSlug || args.topicSlug) {
    const focusSeed = `${args.userId}|${args.dayKey}|focus`;
    const exactTopic = deterministicOrder(
      `${focusSeed}|topic`,
      pool.filter((option) =>
        args.topicSlug ? option.topicSlug === args.topicSlug : false,
      ),
    );
    const sameSection = deterministicOrder(
      `${focusSeed}|section`,
      pool.filter(
        (option) =>
          Boolean(args.sectionSlug) &&
          option.sectionSlug === args.sectionSlug &&
          (!args.topicSlug || option.topicSlug !== args.topicSlug),
      ),
    );
    const remaining = deterministicOrder(
      `${focusSeed}|remaining`,
      pool.filter(
        (option) =>
          (!args.topicSlug || option.topicSlug !== args.topicSlug) &&
          (!args.sectionSlug || option.sectionSlug !== args.sectionSlug),
      ),
    );
    const focused = uniqueEligibleOptions([
      ...exactTopic,
      ...sameSection,
      ...remaining,
    ]).slice(0, effectiveTargetCount);

    if (focused.length === effectiveTargetCount) {
      return focused.map(authoredPracticeTargetFromOption);
    }
  }

  const byModule = new Map<string, PublishedPracticeExerciseOption[]>();
  for (const option of pool) {
    const rows = byModule.get(option.moduleSlug) ?? [];
    rows.push(option);
    byModule.set(option.moduleSlug, rows);
  }

  const moduleGroups = [...byModule.entries()]
    .map(([moduleSlug, rows]) => ({
      moduleSlug,
      rows: deterministicOrder(
        `${args.userId}|${args.dayKey}|${moduleSlug}`,
        rows,
      ),
    }))
    .sort((a, b) => {
      const aFirst = a.rows[0];
      const bFirst = b.rows[0];
      if (!aFirst || !bFirst) return a.moduleSlug.localeCompare(b.moduleSlug);
      return score(`${args.userId}|${args.dayKey}|module`, {
        ...aFirst,
        id: a.moduleSlug,
      }).localeCompare(
        score(`${args.userId}|${args.dayKey}|module`, {
          ...bFirst,
          id: b.moduleSlug,
        }),
      );
    });

  const selected: PublishedPracticeExerciseOption[] = [];
  let round = 0;
  while (selected.length < effectiveTargetCount) {
    let added = false;

    for (const group of moduleGroups) {
      const option = group.rows[round];
      if (!option) continue;
      selected.push(option);
      added = true;
      if (selected.length >= effectiveTargetCount) break;
    }

    if (!added) break;
    round += 1;
  }

  return selected
    .slice(0, effectiveTargetCount)
    .map(authoredPracticeTargetFromOption);
}

export function resolveNextDailyFiveTarget(args: {
  meta: unknown;
  usedTargets: Array<{
    exerciseKey?: string | null;
    topic?: { slug?: string | null } | null;
  }>;
}) {
  const meta = readDailyFiveMeta(args.meta);
  if (!meta) return null;
  return resolveNextAuthoredPracticeTarget({
    queue: meta.queue,
    usedTargets: args.usedTargets,
  });
}

export function applyDailyFiveParams(
  params: GetParams,
  session: {
    meta?: unknown;
    instances?: Array<{
      exerciseKey?: string | null;
      topic?: { slug?: string | null } | null;
    }>;
  } | null | undefined,
): GetParams {
  const target = resolveNextDailyFiveTarget({
    meta: session?.meta,
    usedTargets: session?.instances ?? [],
  });

  if (!target) return params;

  const meta = readDailyFiveMeta(session?.meta);
  return applyAuthoredPracticeTarget({
    params,
    target,
    salt: `daily-five:${meta?.dayKey ?? "today"}:${target.topicSlug}:${target.exerciseKey}`,
  });
}
