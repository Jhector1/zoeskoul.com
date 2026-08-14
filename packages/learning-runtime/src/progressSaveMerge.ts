import type {
  ReviewProgressState,
  ReviewTopicProgress,
} from "./index";
import {
  mergeTopicProgressStates,
  normalizeProgressTopics,
  normalizeTopicProgressKey,
} from "./progressNormalization";

function numericVersion(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isEmptyRecord(value: unknown) {
  return (
    !value ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length === 0)
  );
}

function isAuthoritativeModuleReset(args: {
  previous: ReviewProgressState;
  incoming: ReviewProgressState;
}) {
  const previousVersion = numericVersion(args.previous.quizVersion);
  const incomingVersion = numericVersion(args.incoming.quizVersion);

  return (
    incomingVersion > previousVersion &&
    args.incoming.moduleCompleted === false &&
    !args.incoming.moduleCompletedAt &&
    isEmptyRecord(args.incoming.topics)
  );
}

function isAuthoritativeTopicReset(args: {
  previousTopic: ReviewTopicProgress | undefined;
  incomingTopic: ReviewTopicProgress;
}) {
  const incomingVersion = numericVersion(args.incomingTopic.quizVersion);
  const previousVersion = numericVersion(args.previousTopic?.quizVersion);

  return (
    incomingVersion > previousVersion &&
    args.incomingTopic.completed === false &&
    !args.incomingTopic.completedAt
  );
}

export function getReviewProgressSaveRevision(
  state: ReviewProgressState | null | undefined,
) {
  const revision = Number(
    (state as { __saveRevision?: unknown } | null)?.__saveRevision ?? 0,
  );
  return Number.isFinite(revision) ? revision : 0;
}

export function reviewProgressStateBytes(state: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(state ?? null)).byteLength;
  } catch {
    return 0;
  }
}

/**
 * Normalize the authored topic ids that define one module's persistence scope.
 * This is intentionally small metadata, not learner state.
 */
export function normalizeReviewProgressTopicScope(
  topicIds: readonly string[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of topicIds ?? []) {
    if (typeof value !== "string" || !value.trim()) continue;

    const topicId = normalizeTopicProgressKey(value);
    if (!topicId || seen.has(topicId)) continue;

    seen.add(topicId);
    normalized.push(topicId);
  }

  return normalized;
}

/**
 * Project progress onto the complete authored topic set for the module being
 * loaded/saved. Old rows remain readable; only the canonical in-memory/save
 * representation is narrowed.
 */
export function scopeReviewProgressToTopics(
  state: ReviewProgressState | null | undefined,
  moduleTopicIds: readonly string[] | null | undefined,
): ReviewProgressState {
  const normalized = normalizeProgressTopics(state ?? {});
  const topicScope = normalizeReviewProgressTopicScope(moduleTopicIds);

  if (topicScope.length === 0) {
    return normalized;
  }

  const allowed = new Set(topicScope);
  const topics: Record<string, ReviewTopicProgress> = {};

  for (const [topicKey, topic] of Object.entries(normalized.topics ?? {})) {
    const canonicalTopicKey = normalizeTopicProgressKey(topicKey);
    if (!allowed.has(canonicalTopicKey)) continue;
    topics[canonicalTopicKey] = topic as ReviewTopicProgress;
  }

  const activeTopicId =
    typeof normalized.activeTopicId === "string" &&
    allowed.has(normalizeTopicProgressKey(normalized.activeTopicId))
      ? normalizeTopicProgressKey(normalized.activeTopicId)
      : undefined;

  return {
    ...normalized,
    activeTopicId,
    topics,
  };
}

function timeMs(value: unknown) {
  const n = Number(new Date(String(value ?? "")));
  return Number.isFinite(n) ? n : 0;
}

function pickLatestIso(a: unknown, b: unknown) {
  const aMs = timeMs(a);
  const bMs = timeMs(b);
  if (!aMs && !bMs) return undefined;
  return bMs >= aMs ? (b as string | undefined) : (a as string | undefined);
}

/**
 * Canonical server-side merge for review progress. It preserves independent
 * work from another tab while still respecting explicit module/topic resets.
 */
export function mergeReviewProgressForSave(args: {
  previousState: ReviewProgressState | null;
  incomingState: ReviewProgressState;
  saveRevision: number;
  moduleTopicIds?: readonly string[];
}) {
  const moduleTopicIds =
    normalizeReviewProgressTopicScope(args.moduleTopicIds);

  const previous =
    moduleTopicIds.length > 0
      ? scopeReviewProgressToTopics(
          args.previousState ?? {},
          moduleTopicIds,
        )
      : normalizeProgressTopics(args.previousState ?? {});

  const incoming =
    moduleTopicIds.length > 0
      ? scopeReviewProgressToTopics(
          args.incomingState ?? {},
          moduleTopicIds,
        )
      : normalizeProgressTopics(args.incomingState ?? {});

  if (isAuthoritativeModuleReset({ previous, incoming })) {
    return {
      ...incoming,
      quizVersion: Math.max(
        numericVersion(previous.quizVersion),
        numericVersion(incoming.quizVersion),
      ),
      moduleCompleted: false,
      moduleCompletedAt: undefined,
      topics: {},
      activeTopicId: normalizeTopicProgressKey(
        incoming.activeTopicId ?? previous.activeTopicId,
      ),
      assignmentSessionId:
        incoming.assignmentSessionId ?? previous.assignmentSessionId,
      __saveRevision: args.saveRevision,
    } as ReviewProgressState & { __saveRevision: number };
  }

  const nextTopics: Record<string, ReviewTopicProgress> = {
    ...(previous.topics ?? {}),
  };
  let hasAuthoritativeTopicReset = false;

  const incomingTopicEntries = Object.entries(incoming.topics ?? {}) as Array<
    [string, ReviewTopicProgress]
  >;

  for (const [topicKey, incomingTopic] of incomingTopicEntries) {
    const normalizedTopicKey = normalizeTopicProgressKey(topicKey);
    const previousTopic = nextTopics[normalizedTopicKey];

    if (isAuthoritativeTopicReset({ previousTopic, incomingTopic })) {
      hasAuthoritativeTopicReset = true;
      nextTopics[normalizedTopicKey] = incomingTopic;
      continue;
    }

    const mergedTopic = mergeTopicProgressStates(previousTopic, incomingTopic);
    if (previousTopic?.completed || incomingTopic.completed) {
      mergedTopic.completed = true;
    }
    mergedTopic.completedAt = pickLatestIso(
      previousTopic?.completedAt,
      incomingTopic.completedAt,
    );
    nextTopics[normalizedTopicKey] = mergedTopic;
  }

  const incomingExplicitlyClearsModule =
    incoming.moduleCompleted === false && !incoming.moduleCompletedAt;
  const moduleCompleted =
    hasAuthoritativeTopicReset || incomingExplicitlyClearsModule
      ? false
      : Boolean(previous.moduleCompleted || incoming.moduleCompleted);
  const moduleCompletedAt =
    hasAuthoritativeTopicReset || incomingExplicitlyClearsModule
      ? undefined
      : pickLatestIso(previous.moduleCompletedAt, incoming.moduleCompletedAt);

  return {
    ...previous,
    ...incoming,
    quizVersion: Math.max(
      numericVersion(previous.quizVersion),
      numericVersion(incoming.quizVersion),
    ),
    moduleCompleted,
    moduleCompletedAt,
    activeTopicId: normalizeTopicProgressKey(
      incoming.activeTopicId ?? previous.activeTopicId,
    ),
    assignmentSessionId:
      incoming.assignmentSessionId ?? previous.assignmentSessionId,
    topics: nextTopics,
    __saveRevision: args.saveRevision,
  } as ReviewProgressState & { __saveRevision: number };
}
