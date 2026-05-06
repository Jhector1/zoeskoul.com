import type { ReviewProgressState, ReviewTopicProgress, SavedQuizState } from "@/lib/review/progressTypes";

export function normalizeTopicProgressKey(topicId: string | null | undefined) {
  const raw = String(topicId ?? "").trim();
  if (!raw) return "unknown";

  const parts = raw.split(".").filter(Boolean);
  return parts[parts.length - 1] || raw;
}

function isExplicitUserWork(value: any) {
  return value?.userEdited === true || value?.workspaceOrigin === "user" || value?.workspaceOrigin === "saved";
}

function getUpdatedAt(value: any) {
  return Number(value?.updatedAt ?? 0);
}


function workspaceSummary(value: any) {
  const workspace = value?.workspace ?? value?.codeWorkspace ?? value?.ideWorkspace ?? value?.toolWorkspace ?? null;
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return { hasWorkspace: false, fileCount: 0 };
  }

  return {
    hasWorkspace: true,
    fileCount: workspace.nodes.filter((node: any) => node?.kind === "file").length,
  };
}

function pickPreferredEntry<T>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingUser = isExplicitUserWork(existing);
  const incomingUser = isExplicitUserWork(incoming);

  if (existingUser !== incomingUser) {
    return incomingUser ? incoming : existing;
  }

  const existingUpdatedAt = getUpdatedAt(existing);
  const incomingUpdatedAt = getUpdatedAt(incoming);

  // Canonical conflict rule: the freshest persisted record wins first. File
  // count is only a tie-breaker. This prevents an older browser/tab with a
  // richer local workspace from hiding the newer DB record on another machine.
  if (incomingUpdatedAt !== existingUpdatedAt) {
    return incomingUpdatedAt > existingUpdatedAt ? incoming : existing;
  }

  const existingWorkspace = workspaceSummary(existing);
  const incomingWorkspace = workspaceSummary(incoming);

  if (existingWorkspace.hasWorkspace !== incomingWorkspace.hasWorkspace) {
    return incomingWorkspace.hasWorkspace ? incoming : existing;
  }

  if (existingWorkspace.fileCount !== incomingWorkspace.fileCount) {
    return incomingWorkspace.fileCount > existingWorkspace.fileCount ? incoming : existing;
  }

  return incoming;
}

function mergeRecordMap<T>(base: Record<string, T> | undefined, incoming: Record<string, T> | undefined) {
  const next: Record<string, T> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    next[key] = pickPreferredEntry(next[key], value as T) as T;
  }
  return next;
}

function mergeSavedQuizState(base: SavedQuizState | undefined, incoming: SavedQuizState | undefined): SavedQuizState | undefined {
  if (!base) return incoming;
  if (!incoming) return base;

  return {
    ...base,
    ...incoming,
    answers: { ...(base.answers ?? {}), ...(incoming.answers ?? {}) },
    checkedById: { ...(base.checkedById ?? {}), ...(incoming.checkedById ?? {}) },
    practiceItemPatch: mergeRecordMap(base.practiceItemPatch, incoming.practiceItemPatch),
    practiceMeta: { ...(base.practiceMeta ?? {}), ...(incoming.practiceMeta ?? {}) },
    excusedById: { ...(base.excusedById ?? {}), ...(incoming.excusedById ?? {}) },
    updatedAt: Math.max(Number(base.updatedAt ?? 0), Number(incoming.updatedAt ?? 0)) || undefined,
  };
}

export function mergeTopicProgressStates(base: ReviewTopicProgress | undefined, incoming: ReviewTopicProgress | undefined): ReviewTopicProgress {
  const safeBase = base ?? {};
  const safeIncoming = incoming ?? {};

  const nextQuizState: Record<string, SavedQuizState> = { ...(safeBase.quizState ?? {}) };
  for (const [cardId, quizState] of Object.entries(safeIncoming.quizState ?? {})) {
    nextQuizState[cardId] = mergeSavedQuizState(nextQuizState[cardId], quizState) as SavedQuizState;
  }

  return {
    ...safeBase,
    ...safeIncoming,
    cardsDone: { ...(safeBase.cardsDone ?? {}), ...(safeIncoming.cardsDone ?? {}) },
    quizzesDone: { ...(safeBase.quizzesDone ?? {}), ...(safeIncoming.quizzesDone ?? {}) },
    sketchState: { ...(safeBase.sketchState ?? {}), ...(safeIncoming.sketchState ?? {}) },
    quizState: nextQuizState,
    runtimeStateV2: {
      cards: mergeRecordMap(safeBase.runtimeStateV2?.cards, safeIncoming.runtimeStateV2?.cards),
      exercises: mergeRecordMap(safeBase.runtimeStateV2?.exercises, safeIncoming.runtimeStateV2?.exercises),
    },
    toolState: mergeRecordMap((safeBase as any).toolState, (safeIncoming as any).toolState),
    completed: safeIncoming.completed ?? safeBase.completed,
    completedAt:
      Number(new Date(safeIncoming.completedAt ?? 0)) >= Number(new Date(safeBase.completedAt ?? 0))
        ? safeIncoming.completedAt ?? safeBase.completedAt
        : safeBase.completedAt,
  } as ReviewTopicProgress;
}

export function getTopicProgressState(
  topics: Record<string, ReviewTopicProgress> | null | undefined,
  activeTopicId: string | null | undefined,
) {
  const canonical = normalizeTopicProgressKey(activeTopicId);
  if (topics?.[canonical]) return { topicKey: canonical, topic: topics[canonical] };

  const raw = String(activeTopicId ?? "").trim();
  if (raw && topics?.[raw]) return { topicKey: raw, topic: topics[raw] };

  const matchKey = Object.keys(topics ?? {}).find(
    (key) => normalizeTopicProgressKey(key) === canonical,
  );

  if (matchKey) return { topicKey: matchKey, topic: topics?.[matchKey] ?? null };

  return { topicKey: canonical, topic: null };
}

export function normalizeProgressTopics(state: ReviewProgressState | null | undefined): ReviewProgressState {
  const topics = state?.topics ?? {};
  const nextTopics: Record<string, ReviewTopicProgress> = {};

  for (const [key, topicState] of Object.entries(topics)) {
    const canonical = normalizeTopicProgressKey(key);
    nextTopics[canonical] = mergeTopicProgressStates(nextTopics[canonical], topicState as ReviewTopicProgress);
  }

  return {
    ...(state ?? {}),
    activeTopicId: state?.activeTopicId,
    topics: nextTopics,
  } as ReviewProgressState;
}
