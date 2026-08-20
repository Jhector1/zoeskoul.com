import type { Prisma } from "@/lib/prisma";
import type { GetParams } from "@/lib/practice/api/get/schemas";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  applyAuthoredPracticeTarget,
  authoredPracticeTargetFromOption,
  authoredPracticeTargetIdentity,
  deterministicPublishedPracticeOrder,
  isAuthoredLessonPracticeOption,
  normalizeAuthoredPracticeQueue,
  resolveNextAuthoredPracticeTarget,
  roundRobinPracticeGroups,
  stableAuthoredPracticeSelectionScore,
  uniquePublishedPracticeOptions,
  type AuthoredPracticeTarget,
} from "./authoredPracticeQueue";
import { resolveAvailablePracticeTargetCount } from "./availableTargetCount";

export type SubscriberPracticeScope = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string | null;
  topicSlug: string | null;
};

export type SubscriberPracticeHistoryItem = {
  exerciseKey: string;
  topicSlug: string;
  seenAt: Date | string;
  completedAt?: Date | string | null;
  lastOk?: boolean | null;
  sessionId?: string | null;
};

export type SubscriberPracticeSessionMeta = {
  kind: "subscriber_practice";
  planVersion: 2 | null;
  queue: AuthoredPracticeTarget[];
  completedPrefix: AuthoredPracticeTarget[];
  moduleTotal: number | null;
  scope: SubscriberPracticeScope | null;
  targetCount: number;
  lastOpenedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalSlug(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeSubscriberPracticeScope(
  value: unknown,
): SubscriberPracticeScope | null {
  const record = asRecord(value);
  if (!record) return null;

  const subjectSlug = String(record.subjectSlug ?? "").trim();
  const moduleSlug = String(record.moduleSlug ?? "").trim();
  if (!subjectSlug || !moduleSlug) return null;

  return {
    subjectSlug,
    moduleSlug,
    sectionSlug: normalizeOptionalSlug(record.sectionSlug),
    topicSlug: normalizeOptionalSlug(record.topicSlug),
  };
}

function legacyScopeFromQueue(
  queue: readonly AuthoredPracticeTarget[],
): SubscriberPracticeScope | null {
  const first = queue[0];
  if (!first) return null;

  return {
    subjectSlug: first.subjectSlug,
    moduleSlug: first.moduleSlug,
    sectionSlug: first.sectionSlug,
    topicSlug: first.topicSlug,
  };
}

/**
 * Subscriber Practice uses only exercises explicitly authored for independent
 * practice. Quiz checks, Try Its, projects, and capstones retain their own
 * learner surfaces instead of being silently repurposed here.
 */
export function isSubscriberPracticeEligible(
  option: PublishedPracticeExerciseOption,
) {
  return isAuthoredLessonPracticeOption(option);
}

function normalizeSeenAt(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function focusRank(
  option: PublishedPracticeExerciseOption,
  args: {
    sectionSlug?: string | null;
    topicSlug?: string | null;
  },
) {
  if (args.topicSlug && option.topicSlug === args.topicSlug) return 0;
  if (args.sectionSlug && option.sectionSlug === args.sectionSlug) return 1;
  return 2;
}

function buildTopicGroups(args: {
  options: readonly PublishedPracticeExerciseOption[];
  seed: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  topicSeenCounts: ReadonlyMap<string, number>;
  preserveInputOrder?: boolean;
}) {
  const byTopic = new Map<string, PublishedPracticeExerciseOption[]>();

  for (const option of args.options) {
    const rows = byTopic.get(option.topicSlug) ?? [];
    rows.push(option);
    byTopic.set(option.topicSlug, rows);
  }

  return [...byTopic.entries()]
    .map(([topicSlug, rows]) => ({
      topicSlug,
      focusRank: Math.min(
        ...rows.map((option) =>
          focusRank(option, {
            sectionSlug: args.sectionSlug,
            topicSlug: args.topicSlug,
          }),
        ),
      ),
      seenCount: args.topicSeenCounts.get(topicSlug) ?? 0,
      rows: args.preserveInputOrder
        ? rows
        : deterministicPublishedPracticeOrder(
            `${args.seed}|topic:${topicSlug}`,
            rows,
          ),
    }))
    .sort(
      (left, right) =>
        left.focusRank - right.focusRank ||
        left.seenCount - right.seenCount ||
        stableAuthoredPracticeSelectionScore(
          `${args.seed}|topic-order`,
          left.topicSlug,
        ).localeCompare(
          stableAuthoredPracticeSelectionScore(
            `${args.seed}|topic-order`,
            right.topicSlug,
          ),
        ) ||
        left.topicSlug.localeCompare(right.topicSlug),
    );
}

export function listSubscriberPracticePoolOptions(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
}) {
  return uniquePublishedPracticeOptions(
    args.options.filter((option) => {
      if (!isSubscriberPracticeEligible(option)) return false;
      if (option.subjectSlug !== args.subjectSlug) return false;
      if (option.moduleSlug !== args.moduleSlug) return false;
      if (args.topicSlug && option.topicSlug !== args.topicSlug) return false;
      if (args.sectionSlug && option.sectionSlug !== args.sectionSlug) return false;
      return true;
    }),
  );
}

/**
 * Build one scoped authored Practice queue.
 *
 * Module scope spans the full module. Section/topic scope is a hard candidate
 * boundary, while canonical learner history remains module-wide and shared
 * across every entry origin.
 *
 * Unseen exercises are exhausted before repeats. Topic groups are round-robined
 * so one topic cannot dominate. When the requested scope has been exhausted,
 * older exercises and less-served topics are preferred.
 */
export function pickSubscriberPracticeQueue(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount: number;
  history?: readonly SubscriberPracticeHistoryItem[];
  seed?: string;
}) {
  const pool = listSubscriberPracticePoolOptions({
    options: args.options,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    topicSlug: args.topicSlug,
  });

  const effectiveTargetCount = resolveAvailablePracticeTargetCount({
    requested: args.targetCount,
    available: pool.length,
    fallback: args.targetCount,
  });
  if (effectiveTargetCount === 0) return [];

  const seed =
    String(args.seed ?? "").trim() ||
    `${args.subjectSlug}|${args.moduleSlug}|practice`;

  const latestSeenByIdentity = new Map<string, Date>();
  const topicSeenCounts = new Map<string, number>();

  for (const item of args.history ?? []) {
    const exerciseKey = String(item.exerciseKey ?? "").trim();
    const topicSlug = String(item.topicSlug ?? "").trim();
    if (!exerciseKey || !topicSlug) continue;

    const identity = authoredPracticeTargetIdentity({ topicSlug, exerciseKey });
    const seenAt = normalizeSeenAt(item.seenAt);
    const current = latestSeenByIdentity.get(identity);
    if (!current || seenAt > current) {
      latestSeenByIdentity.set(identity, seenAt);
    }
    topicSeenCounts.set(
      topicSlug,
      (topicSeenCounts.get(topicSlug) ?? 0) + 1,
    );
  }

  const unseen = pool.filter(
    (option) =>
      !latestSeenByIdentity.has(
        authoredPracticeTargetIdentity({
          topicSlug: option.topicSlug,
          exerciseKey: option.exerciseKey,
        }),
      ),
  );
  const seen = pool
    .filter((option) =>
      latestSeenByIdentity.has(
        authoredPracticeTargetIdentity({
          topicSlug: option.topicSlug,
          exerciseKey: option.exerciseKey,
        }),
      ),
    )
    .sort((left, right) => {
      const leftSeen =
        latestSeenByIdentity.get(
          authoredPracticeTargetIdentity({
            topicSlug: left.topicSlug,
            exerciseKey: left.exerciseKey,
          }),
        ) ?? new Date(0);
      const rightSeen =
        latestSeenByIdentity.get(
          authoredPracticeTargetIdentity({
            topicSlug: right.topicSlug,
            exerciseKey: right.exerciseKey,
          }),
        ) ?? new Date(0);

      return leftSeen.getTime() - rightSeen.getTime();
    });

  const unseenSelected = roundRobinPracticeGroups(
    buildTopicGroups({
      options: unseen,
      seed: `${seed}|unseen`,
      sectionSlug: args.sectionSlug,
      topicSlug: args.topicSlug,
      topicSeenCounts,
    }),
    effectiveTargetCount,
  );

  const remaining = effectiveTargetCount - unseenSelected.length;
  const seenSelected =
    remaining > 0
      ? roundRobinPracticeGroups(
          buildTopicGroups({
            options: seen,
            seed: `${seed}|seen`,
            sectionSlug: args.sectionSlug,
            topicSlug: args.topicSlug,
            topicSeenCounts,
            preserveInputOrder: true,
          }),
          remaining,
        )
      : [];

  return [...unseenSelected, ...seenSelected]
    .slice(0, effectiveTargetCount)
    .map(authoredPracticeTargetFromOption);
}

/**
 * Canonical self-paced Practice planner.
 *
 * Every entry origin uses this exact planner:
 * - Lesson/Review passes module scope and no target-count cap.
 * - Header Practice may narrow section/topic and optionally cap new questions.
 *
 * Completion/seen history is still module-wide and origin-independent. Scope
 * only changes the candidate projection and its denominator.
 *
 * `moduleTotal` is retained as the persisted compatibility field name. For a
 * focused Header scope it represents that selected scope's total.
 */
export function buildSubscriberPracticePlan(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
  topicSlug?: string | null;
  targetCount?: number | null;
  history?: readonly SubscriberPracticeHistoryItem[];
  seed?: string;
}) {
  const pool = listSubscriberPracticePoolOptions({
    options: args.options,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    topicSlug: args.topicSlug,
  });
  const completedIdentities = new Set(
    (args.history ?? [])
      .filter((item) => Boolean(item.completedAt))
      .map((item) =>
        authoredPracticeTargetIdentity({
          topicSlug: item.topicSlug,
          exerciseKey: item.exerciseKey,
        }),
      ),
  );
  const completedOptions = pool.filter((option) =>
    completedIdentities.has(
      authoredPracticeTargetIdentity({
        topicSlug: option.topicSlug,
        exerciseKey: option.exerciseKey,
      }),
    ),
  );
  const remainingOptions = pool.filter(
    (option) =>
      !completedIdentities.has(
        authoredPracticeTargetIdentity({
          topicSlug: option.topicSlug,
          exerciseKey: option.exerciseKey,
        }),
      ),
  );
  const targetCount =
    args.targetCount == null
      ? remainingOptions.length
      : resolveAvailablePracticeTargetCount({
          requested: args.targetCount,
          available: remainingOptions.length,
          fallback: args.targetCount,
        });

  return {
    moduleTotal: pool.length,
    completedPrefix: completedOptions.map(authoredPracticeTargetFromOption),
    queue: pickSubscriberPracticeQueue({
      options: remainingOptions,
      subjectSlug: args.subjectSlug,
      moduleSlug: args.moduleSlug,
      sectionSlug: args.sectionSlug,
      topicSlug: args.topicSlug,
      targetCount,
      history: args.history,
      seed: args.seed,
    }),
  };
}

/**
 * Compatibility alias only. There is no second module planner anymore.
 */
export function buildSubscriberModulePracticeContinuationPlan(args: {
  options: readonly PublishedPracticeExerciseOption[];
  subjectSlug: string;
  moduleSlug: string;
  history?: readonly SubscriberPracticeHistoryItem[];
  seed?: string;
}) {
  return buildSubscriberPracticePlan({
    ...args,
    sectionSlug: null,
    topicSlug: null,
    targetCount: null,
  });
}

export function buildSubscriberPracticeMeta(args: {
  queue: AuthoredPracticeTarget[];
  scope?: SubscriberPracticeScope | null;
  completedPrefix?: AuthoredPracticeTarget[];
  moduleTotal?: number | null;
  lastOpenedAt?: Date | string;
}): Prisma.InputJsonValue {
  const openedAt =
    args.lastOpenedAt instanceof Date
      ? args.lastOpenedAt.toISOString()
      : String(args.lastOpenedAt ?? new Date().toISOString());

  const completedPrefix = args.completedPrefix ?? [];
  const moduleTotal =
    typeof args.moduleTotal === "number" &&
    Number.isFinite(args.moduleTotal) &&
    args.moduleTotal >= args.queue.length + completedPrefix.length
      ? Math.floor(args.moduleTotal)
      : null;

  return {
    kind: "subscriber_practice",
    planVersion: 2,
    queue: args.queue,
    completedPrefix,
    moduleTotal,
    scope: args.scope ?? legacyScopeFromQueue(args.queue),
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
  const completedPrefix = normalizeAuthoredPracticeQueue(record.completedPrefix);
  const targetCount = Math.max(0, Math.floor(Number(record.targetCount ?? 0)));
  if (queue.length !== targetCount) return null;

  const rawModuleTotal = Number(record.moduleTotal);
  const moduleTotal =
    Number.isFinite(rawModuleTotal) &&
    rawModuleTotal >= queue.length + completedPrefix.length
      ? Math.floor(rawModuleTotal)
      : null;
  const planVersion = Number(record.planVersion) === 2 ? 2 : null;
  const scope =
    normalizeSubscriberPracticeScope(record.scope) ??
    legacyScopeFromQueue(queue);
  const completedScopeView =
    targetCount === 0 &&
    planVersion === 2 &&
    completedPrefix.length > 0 &&
    moduleTotal === completedPrefix.length &&
    Boolean(scope);

  if (targetCount === 0 && !completedScopeView) return null;

  const rawLastOpenedAt = String(record.lastOpenedAt ?? "").trim();
  const lastOpenedAt = Number.isNaN(Date.parse(rawLastOpenedAt))
    ? null
    : new Date(rawLastOpenedAt).toISOString();

  return {
    kind: "subscriber_practice",
    planVersion,
    queue,
    completedPrefix,
    moduleTotal,
    scope,
    targetCount,
    lastOpenedAt,
  };
}

export function isCompletedSubscriberModulePracticeMeta(args: {
  meta: unknown;
  moduleTotal: number;
  completedPrefix: readonly AuthoredPracticeTarget[];
}) {
  const parsed = readSubscriberPracticeMeta(args.meta);
  if (
    !parsed ||
    parsed.planVersion !== 2 ||
    parsed.targetCount !== 0 ||
    parsed.queue.length !== 0 ||
    parsed.moduleTotal !== args.moduleTotal ||
    parsed.completedPrefix.length !== args.completedPrefix.length ||
    parsed.scope?.sectionSlug !== null ||
    parsed.scope?.topicSlug !== null
  ) {
    return false;
  }

  const expected = new Set(
    args.completedPrefix.map(authoredPracticeTargetIdentity),
  );
  const actual = new Set(
    parsed.completedPrefix.map(authoredPracticeTargetIdentity),
  );

  if (expected.size !== actual.size) return false;
  return [...expected].every((identity) => actual.has(identity));
}

export function subscriberPracticeScopeFromMeta(
  meta: unknown,
): SubscriberPracticeScope | null {
  return readSubscriberPracticeMeta(meta)?.scope ?? null;
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

export function isModuleContinuationSubscriberPracticeMeta(meta: unknown) {
  const parsed = readSubscriberPracticeMeta(meta);
  return Boolean(
    parsed?.planVersion === 2 &&
      parsed.scope &&
      parsed.scope.sectionSlug === null &&
      parsed.scope.topicSlug === null &&
      parsed.moduleTotal !== null,
  );
}

/**
 * A module-continuation session created before canonical completed-prefix
 * hydration can contain exercises that were already completed in another
 * Practice session. Retire only the zero-progress stale run so a fresh module
 * continuation can be built from canonical history.
 *
 * Sessions with learner progress of their own are never retired here.
 */
export function shouldRetireStaleSubscriberModuleContinuationSession(args: {
  sessionId: string;
  total: number;
  meta: unknown;
  history: readonly SubscriberPracticeHistoryItem[];
}) {
  if (args.total > 0 || !isModuleContinuationSubscriberPracticeMeta(args.meta)) {
    return false;
  }

  const parsed = readSubscriberPracticeMeta(args.meta);
  if (!parsed || parsed.completedPrefix.length > 0) return false;

  const externallyCompleted = new Set(
    args.history
      .filter(
        (item) =>
          Boolean(item.completedAt) &&
          String(item.sessionId ?? "") !== args.sessionId,
      )
      .map((item) =>
        authoredPracticeTargetIdentity({
          topicSlug: item.topicSlug,
          exerciseKey: item.exerciseKey,
        }),
      ),
  );

  if (!externallyCompleted.size) return false;

  return parsed.queue.some((target) =>
    externallyCompleted.has(authoredPracticeTargetIdentity(target)),
  );
}

export function touchSubscriberPracticeMeta(
  meta: unknown,
  at: Date = new Date(),
): Prisma.InputJsonValue | null {
  const parsed = readSubscriberPracticeMeta(meta);
  if (!parsed) return null;
  return buildSubscriberPracticeMeta({
    queue: parsed.queue,
    scope: parsed.scope,
    completedPrefix: parsed.completedPrefix,
    moduleTotal: parsed.moduleTotal,
    lastOpenedAt: at,
  });
}

export function applySubscriberPracticeParams(
  params: GetParams,
  session: {
    id?: string | null;
    meta?: unknown;
    instances?: Array<{
      exerciseKey?: string | null;
      publicPayload?: unknown;
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
