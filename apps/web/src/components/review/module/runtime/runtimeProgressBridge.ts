import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";
import type {
  CardRuntimeState,
  ExerciseRuntimeState,
  ReviewRuntimeStore,
} from "./reviewRuntimeTypes";
import { reviewDebug, summarizePracticePatch, summarizeWorkspace } from "./reviewDebug";
import { deriveEntryCode } from "./exerciseWorkspaceResolver";
import { reviewSaveDebug } from "./reviewSaveDebug";

type RuntimeLike = Pick<ReviewRuntimeStore, "exercises" | "cards">;
type UnknownRecord = Record<string, unknown>;
type RuntimeExerciseLike = ExerciseRuntimeState & {
  stableExerciseId?: string;
  exerciseStateId?: string;
  slotId?: string;
  key?: string;
  id?: string;
  submitted?: boolean;
  result?: unknown;
};
type ExercisePatchRecord = UnknownRecord & {
  code?: string;
  source?: string;
  codeLang?: string;
  language?: string;
  lang?: string;
  stdin?: string;
  codeStdin?: string;
  userEdited?: boolean;
  workspaceOrigin?: string;
  starterHash?: string;
  workspace?: unknown;
  codeWorkspace?: unknown;
  ideWorkspace?: unknown;
  updatedAt?: number;
  submitted?: unknown;
  result?: unknown;
  answer?: unknown;
  runner?: unknown;
};
type QuizStateRecord = UnknownRecord & {
  practiceItemPatch?: Record<string, UnknownRecord>;
};
type TopicProgressRecord = UnknownRecord & {
  runtimeStateV2?: {
    exercises?: Record<string, unknown>;
    cards?: Record<string, unknown>;
  };
  quizState?: Record<string, QuizStateRecord>;
  sketchState?: Record<string, unknown>;
  toolState?: Record<string, UnknownRecord>;
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function hasRuntimeState(runtime: RuntimeLike) {
  return (
    Object.keys(runtime.exercises ?? {}).length > 0 ||
    Object.keys(runtime.cards ?? {}).length > 0
  );
}

function isWorkspace(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { version?: number }).version === 2 &&
    Array.isArray((value as { nodes?: unknown }).nodes)
  );
}


function clonePlain<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function addAlias(set: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (text) set.add(text);
}

function isScopedExerciseStateKey(value: unknown) {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw) return false;
  return raw.split(":").filter(Boolean).length >= 6;
}

function lastKeySegment(value: unknown) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const parts = raw.split(":").filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function getLegacyExerciseAliasKeys(
  exerciseKey: string,
  estate: RuntimeExerciseLike,
) {
  const keys = new Set<string>();
  addAlias(keys, lastKeySegment(exerciseKey));
  addAlias(keys, estate?.exerciseId);
  addAlias(keys, lastKeySegment(estate?.exerciseId));
  addAlias(keys, lastKeySegment(estate?.exerciseKey));
  addAlias(keys, lastKeySegment(estate?.stableExerciseId));
  addAlias(keys, lastKeySegment(estate?.exerciseStateId));
  addAlias(keys, lastKeySegment(estate?.slotId));
  addAlias(keys, lastKeySegment(estate?.key));
  addAlias(keys, lastKeySegment(estate?.id));
  return [...keys].filter((key) => !isScopedExerciseStateKey(key));
}

function getExerciseAliasKeys(
  exerciseKey: string,
  estate: RuntimeExerciseLike,
) {
  const keys = new Set<string>();

  addAlias(keys, exerciseKey);
  if (isScopedExerciseStateKey(estate?.exerciseKey)) addAlias(keys, estate?.exerciseKey);
  if (isScopedExerciseStateKey(estate?.stableExerciseId)) addAlias(keys, estate?.stableExerciseId);
  if (isScopedExerciseStateKey(estate?.exerciseStateId)) addAlias(keys, estate?.exerciseStateId);
  if (isScopedExerciseStateKey(estate?.slotId)) addAlias(keys, estate?.slotId);
  if (isScopedExerciseStateKey(estate?.key)) addAlias(keys, estate?.key);
  if (isScopedExerciseStateKey(estate?.id)) addAlias(keys, estate?.id);

  return [...keys];
}

function getExercisePatchForQuizState(
  estate: RuntimeExerciseLike,
): ExercisePatchRecord {
  const workspace =
    isWorkspace(estate.workspace)
      ? estate.workspace
      : isWorkspace(estate.codeWorkspace)
        ? estate.codeWorkspace
        : isWorkspace(estate.ideWorkspace)
          ? estate.ideWorkspace
          : null;

  const workspaceCode = deriveEntryCode(workspace) ?? "";

  /**
   * The workspace is canonical.
   *
   * The stale field that kept resurrecting print("Hello Python!") was code.
   * So when a workspace exists, always derive code/source from the entry file.
   */
  const code =
    workspaceCode ||
    (typeof estate.code === "string"
      ? estate.code
      : typeof estate.source === "string"
        ? estate.source
        : "");

  const stdin =
    typeof workspace?.stdin === "string"
      ? workspace.stdin
      : typeof estate.codeStdin === "string"
        ? estate.codeStdin
        : typeof estate.stdin === "string"
          ? estate.stdin
          : "";

  const lang =
    typeof workspace?.language === "string"
      ? workspace.language
      : typeof estate.codeLang === "string"
        ? estate.codeLang
        : typeof estate.lang === "string"
          ? estate.lang
          : typeof estate.language === "string"
            ? estate.language
            : "python";

  const userEdited =
    estate.userEdited === true ||
    estate.workspaceOrigin === "user" ||
    estate.workspaceOrigin === "saved";

  const patch: ExercisePatchRecord = {
    exerciseKey: estate.exerciseKey,
    exerciseId: estate.exerciseId,
    subjectSlug: estate.subjectSlug,
    moduleSlug: estate.moduleSlug,
    sectionSlug: estate.sectionSlug,
    topicId: estate.topicId,
    cardId: estate.cardId,
    userEdited,
    workspaceOrigin: estate.workspaceOrigin ?? (userEdited ? "saved" : undefined),
    starterHash: estate.starterHash,
    ...(estate.submitted !== undefined ? { submitted: estate.submitted } : {}),
    ...(estate.result !== undefined ? { result: estate.result } : {}),
    ...(estate.answer !== undefined ? { answer: estate.answer } : {}),
    ...(estate.runner !== undefined ? { runner: estate.runner } : {}),
    updatedAt: estate.updatedAt ?? Date.now(),
  };

  /**
   * Only persist code/workspace into quiz practiceItemPatch when it is real
   * learner-owned state.
   *
   * Passive starter/sync snapshots are useful in the runtime store, but if they
   * are copied into quizState.practiceItemPatch they can later override freshly
   * resolved starterCode before the editor renders.
   */
  if (userEdited) {
    patch.code = code;
    patch.source = code;
    patch.codeLang = lang;
    patch.language = lang;
    patch.lang = lang;
    patch.stdin = stdin;
    patch.codeStdin = stdin;

    if (workspace) {
      patch.workspace = workspace;
      patch.codeWorkspace = workspace;
      patch.ideWorkspace = workspace;
    }
  }

  return patch;
}

/**
 * Merge live Zustand runtime into the old persisted ReviewProgressState.
 *
 * Important:
 * useQuizPracticeBank restores from:
 *
 *   topic.quizState[cardId].practiceItemPatch[q5]
 *
 * not only from:
 *
 *   topic.runtimeStateV2.exercises[fullExerciseKey]
 *
 * So this bridge writes the edited workspace into both places.
 */
export function mergeRuntimeIntoProgress(
  progress: ReviewProgressState,
  runtime: RuntimeLike,
): ReviewProgressState {
  if (!hasRuntimeState(runtime)) return progress;

  const nextTopics: Record<string, TopicProgressRecord> = {
    ...((progress.topics ?? {}) as Record<string, TopicProgressRecord>),
  };

  let changed = false;

  const touchTopic = (topicId: string) => {
    const oldTopic = nextTopics[topicId] ?? {};
    const nextTopic = { ...oldTopic };
    nextTopics[topicId] = nextTopic;
    return nextTopic;
  };

  for (const [exerciseKey, rawEstate] of Object.entries(runtime.exercises ?? {})) {
    const estate = rawEstate as RuntimeExerciseLike;

    const topicId =
      typeof estate.topicId === "string" && estate.topicId
        ? estate.topicId
        : null;

    if (!topicId) continue;
    const topicKey = normalizeTopicProgressKey(topicId);

    const cardId =
      typeof estate.cardId === "string" && estate.cardId
        ? estate.cardId
        : null;

    const topic = touchTopic(topicKey);

    const oldRuntime = topic.runtimeStateV2 ?? {};
    const oldRuntimeExercises = oldRuntime.exercises ?? {};
    const oldExercise = asRecord(oldRuntimeExercises[exerciseKey]);

    const shouldWriteRuntime =
      !oldExercise ||
      Number(estate.updatedAt ?? 0) >= Number(oldExercise?.updatedAt ?? 0);

    if (shouldWriteRuntime) {
      const nextRuntime = {
        ...oldRuntime,
        exercises: {
          ...oldRuntimeExercises,
          [exerciseKey]: clonePlain(estate),
        },
        cards: {
          ...(oldRuntime.cards ?? {}),
        },
      };

      topic.runtimeStateV2 = nextRuntime;
      changed = true;
    }

    /**
     * Critical compatibility write.
     *
     * This is the part that stops the q5 project card from restoring
     * print("Hello Python!") after sketch navigation.
     */
    if (cardId) {
      const patch = getExercisePatchForQuizState(estate);
      const aliases = getExerciseAliasKeys(exerciseKey, estate);

      const oldQuizState = topic.quizState ?? {};
      const oldCardQuiz = oldQuizState[cardId] ?? {};
      const oldPracticePatch = oldCardQuiz.practiceItemPatch ?? {};

      reviewDebug("3_BRIDGE_WRITE runtimeProgressBridge.practiceItemPatch", {
        topicId,
        topicKey,
        cardId,
        exerciseKey,
        aliases,
        patchSummary: summarizePracticePatch(patch),
        runtimeWorkspace: summarizeWorkspace(estate.workspace),
        oldAliases: aliases.reduce<Record<string, ReturnType<typeof summarizePracticePatch>>>((acc, alias) => {
          acc[alias] = summarizePracticePatch(oldPracticePatch[alias]);
          return acc;
        }, {}),
      });

      const nextPracticePatch = { ...oldPracticePatch };
      const legacyAliases = getLegacyExerciseAliasKeys(exerciseKey, estate);

      for (const alias of aliases) {
        nextPracticePatch[alias] = {
          ...(oldPracticePatch[alias] ?? {}),
          ...patch,
        };
      }

      /**
       * Compatibility write:
       *
       * Keep the canonical scoped aliases above as the restore source of truth.
       * Also mirror learner-owned patches onto short legacy ids so older save
       * readers and E2E payload inspections can still find the active exercise
       * workspace without depending on the scoped manifest key.
       *
       * Restore no longer trusts these short aliases for authored contract
       * hydration, so this does not reopen the old cross-exercise collision.
       */
      for (const legacyAlias of legacyAliases) {
        nextPracticePatch[legacyAlias] = {
          ...(oldPracticePatch[legacyAlias] ?? {}),
          ...patch,
        };
      }

      const nextCardQuiz = {
        ...oldCardQuiz,
        practiceItemPatch: nextPracticePatch,
      };

      const nextQuizState = {
        ...oldQuizState,
        [cardId]: nextCardQuiz,
      };

      topic.quizState = nextQuizState;
      changed = true;
    }
  }

  for (const [cardKey, rawCardState] of Object.entries(runtime.cards ?? {})) {
    const cstate = rawCardState as CardRuntimeState;

    const topicId =
      typeof cstate.topicId === "string" && cstate.topicId
        ? cstate.topicId
        : null;

    if (!topicId) continue;
    const topicKey = normalizeTopicProgressKey(topicId);

    const cardId =
      typeof cstate.cardId === "string" && cstate.cardId
        ? cstate.cardId
        : cardKey;

    const topic = touchTopic(topicKey);

    const oldRuntime = topic.runtimeStateV2 ?? {};
    const oldRuntimeCards = oldRuntime.cards ?? {};
    const oldCard = asRecord(oldRuntimeCards[cardKey]);

    const shouldWriteRuntime =
      !oldCard ||
      Number(cstate.updatedAt ?? 0) >= Number(oldCard?.updatedAt ?? 0);

    if (shouldWriteRuntime) {
      const nextRuntime = {
        ...oldRuntime,
        exercises: {
          ...(oldRuntime.exercises ?? {}),
        },
        cards: {
          ...oldRuntimeCards,
          [cardKey]: clonePlain(cstate),
        },
      };

      topic.runtimeStateV2 = nextRuntime;
      changed = true;
    }

    if (cstate.sketch) {
      const oldSketchState = topic.sketchState ?? {};
      const nextSketchState = {
        ...oldSketchState,
        [cardId]: clonePlain(cstate.sketch),
      };

      topic.sketchState = nextSketchState;
      changed = true;
    }

    /**
     * Card/sketch Tools workspace compatibility write.
     *
     * Created files in the Tools IDE while on a sketch/card are not exercise
     * workspaces, so they must be persisted under the card toolState key.
     */
    if (cstate.toolWorkspace) {
      const exactToolKey =
        typeof cstate.toolKey === "string" && cstate.toolKey
          ? cstate.toolKey
          : `card:${cardId}`;

      const legacyToolKey = `card:${cardId}`;
      const oldToolState = topic.toolState ?? {};

      const buildToolEntry = (oldEntry: UnknownRecord | undefined) => ({
        ...oldEntry,
        lang: cstate.toolLang ?? oldEntry?.lang ?? "python",
        code: cstate.toolCode ?? oldEntry?.code ?? "",
        stdin: cstate.toolStdin ?? oldEntry?.stdin ?? "",
        userEdited: Boolean(cstate.userEdited),
        workspaceOrigin: cstate.workspaceOrigin,
        starterHash: cstate.starterHash,
        updatedAt: cstate.updatedAt ?? oldEntry?.updatedAt ?? Date.now(),
        workspace: clonePlain(cstate.toolWorkspace),
      });

      const nextToolState = {
        ...oldToolState,
        [exactToolKey]: buildToolEntry(oldToolState[exactToolKey]),
        [legacyToolKey]: buildToolEntry(oldToolState[legacyToolKey]),
      };

      topic.toolState = nextToolState;
      changed = true;
    }
  }

  if (!changed) return progress;
  const next = {
    ...progress,
    topics: nextTopics,
  } as ReviewProgressState;

  reviewSaveDebug("mergeRuntimeIntoProgress", {
    changed,
    activeTopicId: progress.activeTopicId ?? null,
    activeTopicKey: normalizeTopicProgressKey(progress.activeTopicId),
    runtimeExerciseKeys: Object.keys(runtime.exercises ?? {}),
    runtimeCardKeys: Object.keys(runtime.cards ?? {}),
    outputTopicKeys: Object.keys(next.topics ?? {}),
    topicSummary: Object.fromEntries(
      Object.entries(next.topics ?? {}).map(([topicKey, topic]) => [
        topicKey,
        {
          exercises: Object.keys(topic?.runtimeStateV2?.exercises ?? {}),
          savedExerciseKeys: Object.keys(topic?.runtimeStateV2?.exercises ?? {}),
          cards: Object.keys(topic?.runtimeStateV2?.cards ?? {}),
          tools: Object.keys(topic?.toolState ?? {}),
          quizCards: Object.keys(topic?.quizState ?? {}),
          practicePatchExerciseKeys: Object.values(topic?.quizState ?? {}).flatMap(
            (quizState) => Object.keys(quizState?.practiceItemPatch ?? {}),
          ),
        },
      ]),
    ),
  });

  return next;
}
