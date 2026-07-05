import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/prisma";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import type { GetParams } from "@/lib/practice/api/get/schemas";
import {
  DAILY_PRACTICE_TARGET_COUNT,
  normalizeDailyPracticeTargetCount,
} from "./config";

/** @deprecated Prefer DAILY_PRACTICE_TARGET_COUNT for new code. */
export const DAILY_FIVE_TARGET_COUNT = DAILY_PRACTICE_TARGET_COUNT;
export const DAILY_FIVE_MAX_ATTEMPTS = 3;

export type DailyFiveTarget = Pick<
  PublishedPracticeExerciseOption,
  | "subjectSlug"
  | "moduleSlug"
  | "sectionSlug"
  | "topicSlug"
  | "exerciseKey"
  | "exerciseTitle"
  | "exerciseKind"
  | "exercisePurpose"
>;

export type DailyFiveSessionMeta = {
  kind: "daily_five";
  dayKey: string;
  locale: string;
  queue: DailyFiveTarget[];
  targetCount: number;
  maxAttempts: number;
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

  const normalized = queue
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item) => ({
      subjectSlug: String(item!.subjectSlug ?? ""),
      moduleSlug: String(item!.moduleSlug ?? ""),
      sectionSlug: String(item!.sectionSlug ?? ""),
      topicSlug: String(item!.topicSlug ?? ""),
      exerciseKey: String(item!.exerciseKey ?? ""),
      exerciseTitle: String(item!.exerciseTitle ?? item!.exerciseKey ?? "Practice"),
      exerciseKind: String(item!.exerciseKind ?? "code_input"),
      exercisePurpose: item!.exercisePurpose === "project" ? "project" : "quiz",
    }))
    .filter(
      (item) =>
        item.subjectSlug &&
        item.moduleSlug &&
        item.sectionSlug &&
        item.topicSlug &&
        item.exerciseKey,
    ) as DailyFiveTarget[];

  if (normalized.length !== targetCount) return null;

  const maxAttempts = Number(record.maxAttempts);

  return {
    kind: "daily_five",
    dayKey,
    locale,
    queue: normalized,
    targetCount,
    maxAttempts:
      Number.isInteger(maxAttempts) && maxAttempts > 0
        ? maxAttempts
        : DAILY_FIVE_MAX_ATTEMPTS,
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
    (option.exercisePurpose === "quiz" ||
      option.exercisePurpose === "project") &&
    option.isMultiFile !== true &&
    option.requiresTerminal !== true
  );
}

function score(seed: string, option: PublishedPracticeExerciseOption) {
  return createHash("sha256")
    .update(`${seed}|${option.id}`)
    .digest("hex");
}

export function pickDailyFiveQueue(args: {
  options: PublishedPracticeExerciseOption[];
  userId: string;
  dayKey: string;
  subjectSlug?: string | null;
  moduleSlug?: string | null;
  targetCount?: number;
}): DailyFiveTarget[] {
  const targetCount = normalizeDailyPracticeTargetCount(
    args.targetCount ?? DAILY_PRACTICE_TARGET_COUNT,
  );
  const eligible = args.options.filter((option) => {
    if (!isDailyFiveEligible(option)) return false;
    if (args.subjectSlug && option.subjectSlug !== args.subjectSlug) return false;
    if (args.moduleSlug && option.moduleSlug !== args.moduleSlug) return false;
    return true;
  });

  // A daily run may span several sections, but it must stay inside one
  // published module because PracticeSession owns a single module scope.
  // Grouping by section was too strict: many real courses intentionally spread
  // one or two eligible code quizzes across several topics/sections.
  const groups = new Map<string, Map<string, PublishedPracticeExerciseOption>>();
  for (const option of eligible) {
    const moduleKey = `${option.subjectSlug}|${option.moduleSlug}`;
    const byExerciseKey = groups.get(moduleKey) ?? new Map();

    // The same authored exercise can be referenced by more than one card/topic.
    // Count it once so the daily queue is genuinely unique.
    if (!byExerciseKey.has(option.exerciseKey)) {
      byExerciseKey.set(option.exerciseKey, option);
    }
    groups.set(moduleKey, byExerciseKey);
  }

  const candidates = [...groups.entries()]
    .map(([moduleKey, byExerciseKey]) => ({
      moduleKey,
      rows: [...byExerciseKey.values()],
    }))
    .filter(({ rows }) => rows.length >= targetCount)
    .sort((a, b) =>
      score(`${args.userId}|${args.dayKey}`, {
        ...a.rows[0],
        id: a.moduleKey,
      }).localeCompare(
        score(`${args.userId}|${args.dayKey}`, {
          ...b.rows[0],
          id: b.moduleKey,
        }),
      ),
    );

  const pool = candidates[0]?.rows ?? [];
  return [...pool]
    .sort((a, b) =>
      score(`${args.userId}|${args.dayKey}`, a).localeCompare(
        score(`${args.userId}|${args.dayKey}`, b),
      ),
    )
    .slice(0, targetCount)
    .map((option) => ({
      subjectSlug: option.subjectSlug,
      moduleSlug: option.moduleSlug,
      sectionSlug: option.sectionSlug,
      topicSlug: option.topicSlug,
      exerciseKey: option.exerciseKey,
      exerciseTitle: option.exerciseTitle,
      exerciseKind: option.exerciseKind,
      exercisePurpose: option.exercisePurpose,
    }));
}

export function resolveNextDailyFiveTarget(args: {
  meta: unknown;
  usedExerciseKeys: Array<string | null | undefined>;
}) {
  const meta = readDailyFiveMeta(args.meta);
  if (!meta) return null;
  const used = new Set(args.usedExerciseKeys.filter(Boolean).map(String));
  return meta.queue.find((target) => !used.has(target.exerciseKey)) ?? null;
}

export function applyDailyFiveParams(
  params: GetParams,
  session: {
    meta?: unknown;
    instances?: Array<{ exerciseKey?: string | null }>;
  } | null | undefined,
): GetParams {
  const target = resolveNextDailyFiveTarget({
    meta: session?.meta,
    usedExerciseKeys: session?.instances?.map((row) => row.exerciseKey) ?? [],
  });

  if (!target) return params;

  const meta = readDailyFiveMeta(session?.meta);
  return {
    ...params,
    subject: target.subjectSlug,
    module: target.moduleSlug,
    section: target.sectionSlug,
    topic: target.topicSlug,
    exerciseKey: target.exerciseKey,
    preferKind: "code_input",
    preferPurpose: target.exercisePurpose,
    purposePolicy: "strict",
    seedPolicy: "global",
    salt: `daily-five:${meta?.dayKey ?? "today"}:${target.exerciseKey}`,
    allowReveal: "true",
  };
}
