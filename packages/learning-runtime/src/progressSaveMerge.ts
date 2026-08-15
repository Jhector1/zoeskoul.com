import type {
  ReviewProgressState,
  ReviewTopicProgress,
} from "./index";
import {
  mergeTopicProgressStates,
  normalizeProgressTopics,
  normalizeTopicProgressKey,
} from "./progressNormalization";
import { getWorkspaceEntryCode } from "@zoeskoul/workspace-contracts";

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

type WorkspaceCarrierRecord = Record<string, any>;

function asWorkspaceCarrierRecord(value: unknown): WorkspaceCarrierRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WorkspaceCarrierRecord)
    : null;
}

/**
 * Canonicalize one persisted workspace carrier.
 *
 * `workspace` is current. `codeWorkspace` and `ideWorkspace` remain readable
 * as legacy inputs, but new persisted state must not mirror the same full
 * workspace object under multiple keys.
 */
export function canonicalizeReviewWorkspaceCarrier<T>(value: T): T {
  const record = asWorkspaceCarrierRecord(value);
  if (!record) return value;

  const hasCodeWorkspace = Object.prototype.hasOwnProperty.call(
    record,
    "codeWorkspace",
  );
  const hasIdeWorkspace = Object.prototype.hasOwnProperty.call(
    record,
    "ideWorkspace",
  );

  if (!hasCodeWorkspace && !hasIdeWorkspace) return value;

  const next: WorkspaceCarrierRecord = { ...record };

  if (next.workspace == null) {
    if (next.codeWorkspace != null) {
      next.workspace = next.codeWorkspace;
    } else if (next.ideWorkspace != null) {
      next.workspace = next.ideWorkspace;
    }
  }

  delete next.codeWorkspace;
  delete next.ideWorkspace;

  return next as T;
}


function isCanonicalReviewWorkspace(value: unknown) {
  const workspace = asWorkspaceCarrierRecord(value);
  return Boolean(
    workspace &&
      workspace.version === 2 &&
      Array.isArray(workspace.nodes),
  );
}

function allPresentStringMirrorsMatch(
  record: WorkspaceCarrierRecord,
  keys: readonly string[],
  canonicalValue: string,
) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (typeof value !== "string" || value !== canonicalValue) {
      return false;
    }
  }
  return true;
}

/**
 * Remove flat exercise editor mirrors only when the canonical workspace proves
 * they are exact duplicates.
 *
 * This is deliberately conservative for legacy rows:
 * - no workspace => keep scalars;
 * - malformed workspace => keep scalars;
 * - any scalar disagrees with workspace => keep scalars.
 *
 * Runtime state is unchanged. This only reduces persisted review progress.
 */
function canonicalizeReviewExerciseScalarMirrors<T>(value: T): T {
  const canonicalWorkspaceCarrier =
    canonicalizeReviewWorkspaceCarrier(value);
  const record = asWorkspaceCarrierRecord(canonicalWorkspaceCarrier);
  if (!record || !isCanonicalReviewWorkspace(record.workspace)) {
    return canonicalWorkspaceCarrier;
  }

  const workspace = record.workspace as WorkspaceCarrierRecord;
  const workspaceCode = getWorkspaceEntryCode(workspace);
  if (typeof workspaceCode !== "string") {
    return canonicalWorkspaceCarrier;
  }

  const workspaceLanguage =
    typeof workspace.language === "string" ? workspace.language : "";
  const workspaceStdin =
    typeof workspace.stdin === "string" ? workspace.stdin : "";

  if (
    !allPresentStringMirrorsMatch(
      record,
      ["code", "source"],
      workspaceCode,
    ) ||
    !allPresentStringMirrorsMatch(
      record,
      ["language", "lang", "codeLang"],
      workspaceLanguage,
    ) ||
    !allPresentStringMirrorsMatch(
      record,
      ["stdin", "codeStdin"],
      workspaceStdin,
    )
  ) {
    return canonicalWorkspaceCarrier;
  }

  const mirrorKeys = [
    "code",
    "source",
    "language",
    "lang",
    "codeLang",
    "stdin",
    "codeStdin",
  ] as const;

  if (
    !mirrorKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(record, key),
    )
  ) {
    return canonicalWorkspaceCarrier;
  }

  const next: WorkspaceCarrierRecord = { ...record };
  for (const key of mirrorKeys) {
    delete next[key];
  }

  return next as T;
}

function canonicalizeReviewExerciseCarrierMap(value: unknown) {
  const record = asWorkspaceCarrierRecord(value);
  if (!record) return value;

  let changed = false;
  const next: WorkspaceCarrierRecord = {};

  for (const [key, entry] of Object.entries(record)) {
    const canonical = canonicalizeReviewExerciseScalarMirrors(entry);
    next[key] = canonical;
    if (canonical !== entry) changed = true;
  }

  return changed ? next : value;
}

function canonicalizeWorkspaceCarrierMap(value: unknown) {
  const record = asWorkspaceCarrierRecord(value);
  if (!record) return value;

  let changed = false;
  const next: WorkspaceCarrierRecord = {};

  for (const [key, entry] of Object.entries(record)) {
    const canonical = canonicalizeReviewWorkspaceCarrier(entry);
    next[key] = canonical;
    if (canonical !== entry) changed = true;
  }

  return changed ? next : value;
}

function canonicalizeQuizWorkspaceAliases(value: unknown) {
  const quizState = asWorkspaceCarrierRecord(value);
  if (!quizState) return value;

  let changed = false;
  const nextQuiz: WorkspaceCarrierRecord = {};

  for (const [cardKey, rawCard] of Object.entries(quizState)) {
    const card = asWorkspaceCarrierRecord(rawCard);
    if (!card) {
      nextQuiz[cardKey] = rawCard;
      continue;
    }

    const practiceItemPatch =
      canonicalizeReviewExerciseCarrierMap(
        card.practiceItemPatch,
      );

    if (practiceItemPatch === card.practiceItemPatch) {
      nextQuiz[cardKey] = rawCard;
      continue;
    }

    changed = true;
    nextQuiz[cardKey] = {
      ...card,
      practiceItemPatch,
    };
  }

  return changed ? nextQuiz : value;
}

function canonicalizeRuntimeWorkspaceAliases(value: unknown) {
  const runtimeState = asWorkspaceCarrierRecord(value);
  if (!runtimeState) return value;

  const cards = canonicalizeWorkspaceCarrierMap(runtimeState.cards);
  const exercises = canonicalizeReviewExerciseCarrierMap(
    runtimeState.exercises,
  );

  if (
    cards === runtimeState.cards &&
    exercises === runtimeState.exercises
  ) {
    return value;
  }

  return {
    ...runtimeState,
    ...(cards !== runtimeState.cards ? { cards } : {}),
    ...(exercises !== runtimeState.exercises ? { exercises } : {}),
  };
}

/**
 * Normalize legacy workspace aliases at the review-progress persistence
 * boundary while preserving legacy read compatibility elsewhere.
 *
 * `toolWorkspace` is intentionally untouched: it is distinct card/sketch
 * Tools runtime state, not an alias of an exercise workspace.
 */
export function canonicalizeReviewProgressWorkspaceAliases(
  state: ReviewProgressState | null | undefined,
): ReviewProgressState {
  const normalized = normalizeProgressTopics(state ?? {});
  const topics = normalized.topics ?? {};

  let changed = false;
  const nextTopics: Record<string, ReviewTopicProgress> = {};

  for (const [topicKey, rawTopic] of Object.entries(topics)) {
    const topic = rawTopic as ReviewTopicProgress & WorkspaceCarrierRecord;

    const quizState = canonicalizeQuizWorkspaceAliases(topic.quizState);
    const toolState = canonicalizeWorkspaceCarrierMap(topic.toolState);
    const sketchState = canonicalizeWorkspaceCarrierMap(topic.sketchState);
    const runtimeStateV2 = canonicalizeRuntimeWorkspaceAliases(
      topic.runtimeStateV2,
    );

    if (
      quizState === topic.quizState &&
      toolState === topic.toolState &&
      sketchState === topic.sketchState &&
      runtimeStateV2 === topic.runtimeStateV2
    ) {
      nextTopics[topicKey] = rawTopic;
      continue;
    }

    changed = true;
    nextTopics[topicKey] = {
      ...topic,
      ...(quizState !== topic.quizState ? { quizState } : {}),
      ...(toolState !== topic.toolState ? { toolState } : {}),
      ...(sketchState !== topic.sketchState ? { sketchState } : {}),
      ...(runtimeStateV2 !== topic.runtimeStateV2
        ? { runtimeStateV2 }
        : {}),
    } as ReviewTopicProgress;
  }

  return changed
    ? {
        ...normalized,
        topics: nextTopics,
      }
    : normalized;
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

  const previous = canonicalizeReviewProgressWorkspaceAliases(
    moduleTopicIds.length > 0
      ? scopeReviewProgressToTopics(
          args.previousState ?? {},
          moduleTopicIds,
        )
      : normalizeProgressTopics(args.previousState ?? {}),
  );

  const incoming = canonicalizeReviewProgressWorkspaceAliases(
    moduleTopicIds.length > 0
      ? scopeReviewProgressToTopics(
          args.incomingState ?? {},
          moduleTopicIds,
        )
      : normalizeProgressTopics(args.incomingState ?? {}),
  );

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
