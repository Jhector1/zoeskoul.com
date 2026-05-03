import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { stableJson } from "@/lib/client/persistence/stableJson";
import type { ReviewRuntimeStore } from "./reviewRuntimeTypes";
import { reviewDebug, summarizePracticePatch, summarizeWorkspace } from "./reviewDebug";
import { deriveEntryCode } from "./exerciseWorkspaceResolver";

type RuntimeLike = Pick<ReviewRuntimeStore, "exercises" | "cards">;

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
    (value as any).version === 2 &&
    Array.isArray((value as any).nodes)
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

function lastKeySegment(value: unknown) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const parts = raw.split(":").filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function getExerciseAliasKeys(exerciseKey: string, estate: any) {
  const keys = new Set<string>();

  addAlias(keys, exerciseKey);
  addAlias(keys, lastKeySegment(exerciseKey));

  addAlias(keys, estate?.exerciseId);
  addAlias(keys, lastKeySegment(estate?.exerciseId));

  addAlias(keys, estate?.exerciseKey);
  addAlias(keys, lastKeySegment(estate?.exerciseKey));

  addAlias(keys, estate?.stableExerciseId);
  addAlias(keys, estate?.exerciseStateId);
  addAlias(keys, estate?.slotId);
  addAlias(keys, estate?.key);
  addAlias(keys, estate?.id);

  return [...keys];
}

function getExercisePatchForQuizState(estate: any) {
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

  return {
    code,
    source: code,
    codeLang: lang,
    language: lang,
    lang,
    stdin,
    codeStdin: stdin,
    ...(workspace
      ? {
          workspace,
          codeWorkspace: workspace,
          ideWorkspace: workspace,
        }
      : {}),
    ...(estate.submitted !== undefined ? { submitted: estate.submitted } : {}),
    ...(estate.result !== undefined ? { result: estate.result } : {}),
    ...(estate.answer !== undefined ? { answer: estate.answer } : {}),
    ...(estate.runner !== undefined ? { runner: estate.runner } : {}),
    updatedAt: estate.updatedAt ?? Date.now(),
  };
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

  const nextTopics: Record<string, any> = {
    ...(((progress as any).topics ?? {}) as Record<string, any>),
  };

  let changed = false;

  const touchTopic = (topicId: string) => {
    const oldTopic = nextTopics[topicId] ?? {};
    const nextTopic = { ...oldTopic };
    nextTopics[topicId] = nextTopic;
    return nextTopic;
  };

  for (const [exerciseKey, rawEstate] of Object.entries(runtime.exercises ?? {})) {
    const estate = rawEstate as any;

    const topicId =
      typeof estate.topicId === "string" && estate.topicId
        ? estate.topicId
        : null;

    if (!topicId) continue;

    const cardId =
      typeof estate.cardId === "string" && estate.cardId
        ? estate.cardId
        : null;

    const topic = touchTopic(topicId);

    const oldRuntime = topic.runtimeStateV2 ?? {};
    const oldRuntimeExercises = oldRuntime.exercises ?? {};
    const oldExercise = oldRuntimeExercises[exerciseKey];

    const shouldWriteRuntime =
      !oldExercise ||
      Number(estate.updatedAt ?? 0) >= Number(oldExercise.updatedAt ?? 0);

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

      if (stableJson(oldRuntime) !== stableJson(nextRuntime)) {
        topic.runtimeStateV2 = nextRuntime;
        changed = true;
      }
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
        cardId,
        exerciseKey,
        aliases,
        patchSummary: summarizePracticePatch(patch),
        runtimeWorkspace: summarizeWorkspace((estate as any).workspace),
        oldAliases: aliases.reduce((acc: any, alias) => {
          acc[alias] = summarizePracticePatch(oldPracticePatch[alias]);
          return acc;
        }, {}),
      });

      const nextPracticePatch = { ...oldPracticePatch };

      for (const alias of aliases) {
        nextPracticePatch[alias] = {
          ...(oldPracticePatch[alias] ?? {}),
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

      if (stableJson(oldQuizState) !== stableJson(nextQuizState)) {
        topic.quizState = nextQuizState;
        changed = true;
      }
    }
  }

  for (const [cardKey, rawCardState] of Object.entries(runtime.cards ?? {})) {
    const cstate = rawCardState as any;

    const topicId =
      typeof cstate.topicId === "string" && cstate.topicId
        ? cstate.topicId
        : null;

    if (!topicId) continue;

    const cardId =
      typeof cstate.cardId === "string" && cstate.cardId
        ? cstate.cardId
        : cardKey;

    const topic = touchTopic(topicId);

    const oldRuntime = topic.runtimeStateV2 ?? {};
    const oldRuntimeCards = oldRuntime.cards ?? {};
    const oldCard = oldRuntimeCards[cardKey];

    const shouldWriteRuntime =
      !oldCard ||
      Number(cstate.updatedAt ?? 0) >= Number(oldCard.updatedAt ?? 0);

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

      if (stableJson(oldRuntime) !== stableJson(nextRuntime)) {
        topic.runtimeStateV2 = nextRuntime;
        changed = true;
      }
    }

    if (cstate.sketch) {
      const oldSketchState = topic.sketchState ?? {};
      const nextSketchState = {
        ...oldSketchState,
        [cardId]: clonePlain(cstate.sketch),
      };

      if (stableJson(oldSketchState) !== stableJson(nextSketchState)) {
        topic.sketchState = nextSketchState;
        changed = true;
      }
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

      const buildToolEntry = (oldEntry: any) => ({
        ...oldEntry,
        lang: cstate.toolLang ?? oldEntry?.lang ?? "python",
        code: cstate.toolCode ?? oldEntry?.code ?? "",
        stdin: cstate.toolStdin ?? oldEntry?.stdin ?? "",
        workspace: clonePlain(cstate.toolWorkspace),
      });

      const nextToolState = {
        ...oldToolState,
        [exactToolKey]: buildToolEntry(oldToolState[exactToolKey]),
        [legacyToolKey]: buildToolEntry(oldToolState[legacyToolKey]),
      };

      if (stableJson(oldToolState) !== stableJson(nextToolState)) {
        topic.toolState = nextToolState;
        changed = true;
      }
    }
  }

  if (!changed) return progress;

  return {
    ...(progress as any),
    topics: nextTopics,
  } as ReviewProgressState;
}
