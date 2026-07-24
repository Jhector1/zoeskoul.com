import type {
  ReviewProgressState,
  ReviewTopicProgress,
} from "@/lib/review/progressTypes";
import {
  mergeTopicProgressStates,
  normalizeProgressTopics,
  normalizeTopicProgressKey,
} from "@/lib/review/progressTopicKeys";

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
}) {
  const previous = normalizeProgressTopics(args.previousState ?? {});
  const incoming = normalizeProgressTopics(args.incomingState ?? {});

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
