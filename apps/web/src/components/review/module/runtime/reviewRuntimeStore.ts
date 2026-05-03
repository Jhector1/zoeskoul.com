import { create } from "zustand";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type {
  CardRuntimeState,
  ExerciseRuntimeState,
  ReviewRuntimeStore,
} from "./reviewRuntimeTypes";
import { resolveExerciseWorkspace } from "./exerciseWorkspaceResolver";
import { resolveSketchState } from "./sketchResolver";
import { reviewDebug, summarizeWorkspace } from "./reviewDebug";
import { exerciseDebug, summarizeExercisePatch, summarizeExerciseWorkspace } from "./exerciseDebug";

type InternalStore = ReviewRuntimeStore & {
  _flushToolSnapshotCb: (() => void) | null;
};

function isWorkspace(value: unknown): value is WorkspaceStateV2 {
  return (
    !!value &&
    typeof value === "object" &&
    (value as any).version === 2 &&
    Array.isArray((value as any).nodes)
  );
}

function deriveCodeFromWorkspace(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace) return "";

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const entryNode = workspace.nodes.find(
    (node) => node.kind === "file" && node.id === entryId,
  );

  return entryNode && entryNode.kind === "file"
    ? String(entryNode.content ?? "")
    : "";
}

function normalizeWorkspacePatch(args: {
  workspace: WorkspaceStateV2;
  stdin?: string;
}) {
  const stdin =
    typeof args.stdin === "string"
      ? args.stdin
      : typeof args.workspace.stdin === "string"
        ? args.workspace.stdin
        : "";

  const workspace = {
    ...args.workspace,
    stdin,
  };

  return {
    workspace,
    codeWorkspace: workspace,
    ideWorkspace: workspace,
    stdin,
    codeStdin: stdin,
    code: deriveCodeFromWorkspace(workspace),
  };
}

function getPatchWorkspace(
  patch: Record<string, any>,
  existing?: ExerciseRuntimeState,
) {
  if (isWorkspace(patch.workspace)) return patch.workspace;
  if (isWorkspace(patch.codeWorkspace)) return patch.codeWorkspace;
  if (isWorkspace(patch.ideWorkspace)) return patch.ideWorkspace;
  return existing?.workspace ?? null;
}

function getFinalExerciseIdFromKey(key: string) {
  const parts = String(key ?? "").split(":").filter(Boolean);
  return parts[parts.length - 1] || key;
}

export const useReviewRuntimeStore = create<InternalStore>((set, get) => ({
  subjectSlug: null,
  moduleSlug: null,
  sectionSlug: null,

  activeTopicId: null,
  viewTopicId: null,
  activeCardIndex: 0,
  activeExerciseKey: null,

  cards: {},
  exercises: {},

  tool: {
    boundExerciseKey: null,
  },

  persistence: {
    dirty: false,
    pendingExerciseKeys: new Set(),
    pendingCardKeys: new Set(),
  },

  _flushToolSnapshotCb: null,

  setReviewScope: (scope) => {
    set((state) => ({
      subjectSlug:
        typeof scope.subjectSlug !== "undefined"
          ? scope.subjectSlug
          : state.subjectSlug,
      moduleSlug:
        typeof scope.moduleSlug !== "undefined"
          ? scope.moduleSlug
          : state.moduleSlug,
      sectionSlug:
        typeof scope.sectionSlug !== "undefined"
          ? scope.sectionSlug
          : state.sectionSlug,
      activeTopicId:
        typeof scope.activeTopicId !== "undefined"
          ? scope.activeTopicId
          : state.activeTopicId,
      viewTopicId:
        typeof scope.viewTopicId !== "undefined"
          ? scope.viewTopicId
          : state.viewTopicId,
    }));
  },

  setTopicIds: (activeTopicId, viewTopicId) => {
    set({ activeTopicId, viewTopicId });
  },

  ensureExercise: (args) => {
    const {
      exerciseKey,
      subjectSlug,
      moduleSlug,
      sectionSlug,
      topicId,
      cardId,
      manifest,
      saved,
    } = args;

    set((state) => {
      if (state.exercises[exerciseKey]) return state;

      const language =
        manifest?.language ??
        manifest?.lang ??
        saved?.language ??
        saved?.lang ??
        "python";

      const savedWorkspace =
        saved && isWorkspace(saved.workspace)
          ? saved.workspace
          : saved && isWorkspace(saved.codeWorkspace)
            ? saved.codeWorkspace
            : saved && isWorkspace(saved.ideWorkspace)
              ? saved.ideWorkspace
              : null;

      const workspace = resolveExerciseWorkspace({
        language,
        manifest,
        saved: savedWorkspace,
      });

      const stdin =
        typeof saved?.stdin === "string"
          ? saved.stdin
          : typeof saved?.codeStdin === "string"
            ? saved.codeStdin
            : typeof workspace.stdin === "string"
              ? workspace.stdin
              : typeof manifest?.workspace?.initialStdin === "string"
                ? manifest.workspace.initialStdin
                : typeof manifest?.initialStdin === "string"
                  ? manifest.initialStdin
                  : typeof manifest?.stdin === "string"
                    ? manifest.stdin
                    : "";

      const normalized = normalizeWorkspacePatch({ workspace, stdin });

      exerciseDebug("G_reviewRuntimeStore_ensureExercise_create", {
        exerciseKey,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        manifestId: manifest?.id,
        savedPatch: summarizeExercisePatch(saved),
        resolvedWorkspace: summarizeExerciseWorkspace(workspace),
        stdin,
      });

      const exercise: ExerciseRuntimeState = {
        exerciseKey,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        exerciseId:
          typeof saved?.exerciseId === "string"
            ? saved.exerciseId
            : typeof saved?.stableExerciseId === "string"
              ? saved.stableExerciseId
              : getFinalExerciseIdFromKey(exerciseKey),
        language,
        workspace: normalized.workspace,
        stdin,
        runner: saved?.runner ?? {},
        answer: saved?.answer ?? {
          revealed: false,
          solutionCode:
            manifest?.recipe?.solutionCode ??
            manifest?.solutionCode ??
            undefined,
          solutionFiles:
            manifest?.recipe?.solutionFiles ??
            manifest?.solutionFiles ??
            undefined,
        },
        sketch: resolveSketchState({
          savedSketch: saved?.sketch ?? null,
          starterSketch: manifest?.starterSketch ?? null,
        }),
        status: saved?.status ?? "not_started",
        updatedAt:
          typeof saved?.updatedAt === "number" ? saved.updatedAt : Date.now(),

        code: typeof saved?.code === "string" ? saved.code : normalized.code,
        lang: typeof saved?.lang === "string" ? saved.lang : language,
        codeWorkspace: normalized.workspace,
        ideWorkspace: normalized.workspace,
        codeStdin: stdin,
      };

      return {
        exercises: {
          ...state.exercises,
          [exerciseKey]: exercise,
        },
      };
    });
  },

  patchExercise: (key, patch) => {
    set((state) => {
      const existing = state.exercises[key];
      const incomingWorkspace = getPatchWorkspace(patch, existing);

      if (!existing && !incomingWorkspace) return state;

      const stdin =
        typeof patch.stdin === "string"
          ? patch.stdin
          : typeof patch.codeStdin === "string"
            ? patch.codeStdin
            : typeof incomingWorkspace?.stdin === "string"
              ? incomingWorkspace.stdin
              : existing?.stdin ?? "";

      const normalized = incomingWorkspace
        ? normalizeWorkspacePatch({ workspace: incomingWorkspace, stdin })
        : null;

      const workspace = normalized?.workspace ?? existing!.workspace;

      /**
       * Workspace is canonical.
       *
       * If a workspace is present, derive code from the entry file.
       * Do not let stale patch.code resurrect starter code like:
       * print("Hello Python!")
       */
      const code =
        normalized?.code ??
        deriveCodeFromWorkspace(workspace) ??
        (typeof patch.code === "string" ? patch.code : "");

      exerciseDebug("H_reviewRuntimeStore_patchExercise", {
        key,
        existingExerciseId: existing?.exerciseId,
        patchExerciseId: (patch as any).exerciseId,
        patchKeys: Object.keys(patch ?? {}),
        patch: summarizeExercisePatch(patch),
        existing: summarizeExercisePatch(existing),
        nextCode: code,
        nextWorkspace: summarizeExerciseWorkspace(workspace),
      });

      reviewDebug("2_RUNTIME_PATCH reviewRuntimeStore.patchExercise", {
        key,
        patchKeys: Object.keys(patch ?? {}),
        patchCode: typeof patch.code === "string" ? patch.code : "",
        derivedCode: code,
        existingCode: existing?.code ?? "",
        workspace: summarizeWorkspace(workspace),
        existingExerciseId: existing?.exerciseId,
        patchExerciseId: (patch as any).exerciseId,
      });

      const nextPending = new Set(state.persistence.pendingExerciseKeys);
      nextPending.add(key);

      const fallback: ExerciseRuntimeState = {
        exerciseKey: key,
        subjectSlug: existing?.subjectSlug ?? state.subjectSlug ?? "unknown",
        moduleSlug: existing?.moduleSlug ?? state.moduleSlug ?? "unknown",
        sectionSlug: existing?.sectionSlug ?? state.sectionSlug ?? undefined,
        topicId: existing?.topicId ?? state.viewTopicId ?? "unknown",
        cardId: existing?.cardId ?? "unknown",
        exerciseId:
          typeof patch.exerciseId === "string"
            ? patch.exerciseId
            : getFinalExerciseIdFromKey(key),
        language:
          typeof patch.language === "string"
            ? patch.language
            : typeof patch.lang === "string"
              ? patch.lang
              : existing?.language ?? workspace.language ?? "python",
        workspace,
        stdin,
        runner: existing?.runner ?? {},
        answer: existing?.answer ?? { revealed: false },
        sketch: existing?.sketch ?? null,
        status: existing?.status ?? "in_progress",
        updatedAt: Date.now(),
        code,
        lang:
          typeof patch.lang === "string"
            ? patch.lang
            : typeof patch.language === "string"
              ? patch.language
              : existing?.lang ?? workspace.language ?? "python",
        codeWorkspace: workspace,
        ideWorkspace: workspace,
        codeStdin: stdin,
      };

      const nextExercise: ExerciseRuntimeState = {
        ...fallback,
        ...existing,
        ...patch,
        workspace,
        codeWorkspace: workspace,
        ideWorkspace: workspace,
        stdin,
        codeStdin: stdin,
        code,
        language:
          typeof patch.language === "string"
            ? patch.language
            : typeof patch.lang === "string"
              ? patch.lang
              : existing?.language ?? fallback.language,
        lang:
          typeof patch.lang === "string"
            ? patch.lang
            : typeof patch.language === "string"
              ? patch.language
              : existing?.lang ?? fallback.lang,
        status:
          existing?.status === "not_started" || !existing
            ? "in_progress"
            : existing.status,
        updatedAt: Date.now(),
      };

      return {
        exercises: {
          ...state.exercises,
          [key]: nextExercise,
        },
        persistence: {
          ...state.persistence,
          dirty: true,
          pendingExerciseKeys: nextPending,
        },
      };
    });

    get().queueAutosave();
  },

  ensureCard: (args) => {
    const { cardKey, topicId, cardId, initial, starterSketch } = args;

    set((state) => {
      if (state.cards[cardKey]) return state;

      const card: CardRuntimeState = {
        cardKey,
        topicId,
        cardId,
        visited: initial?.visited ?? false,
        completed: initial?.completed ?? false,
        sketch: resolveSketchState({
          savedSketch: initial?.sketch ?? null,
          starterSketch: starterSketch ?? null,
        }),
        updatedAt:
          typeof initial?.updatedAt === "number" ? initial.updatedAt : Date.now(),
      };

      return {
        cards: {
          ...state.cards,
          [cardKey]: card,
        },
      };
    });
  },

  patchCard: (key, patch) => {
    set((state) => {
      const existing = state.cards[key];

      const nextPending = new Set(state.persistence.pendingCardKeys);
      nextPending.add(key);

      const fallback: CardRuntimeState = {
        cardKey: key,
        topicId: existing?.topicId ?? state.viewTopicId ?? "unknown",
        cardId: existing?.cardId ?? key,
        visited: existing?.visited ?? false,
        completed: existing?.completed ?? false,
        sketch: existing?.sketch ?? null,
        updatedAt: Date.now(),
      };

      return {
        cards: {
          ...state.cards,
          [key]: {
            ...fallback,
            ...existing,
            ...patch,
            updatedAt: Date.now(),
          },
        },
        persistence: {
          ...state.persistence,
          dirty: true,
          pendingCardKeys: nextPending,
        },
      };
    });

    get().queueAutosave();
  },

  bindExerciseTool: (key) => {
    const current = get().tool.boundExerciseKey;

    /**
     * Idempotent bind.
     * Prevents render/effect loops when the active exercise asks to bind
     * while the tool is already bound to the same exercise.
     */
    if (current === key && get().activeExerciseKey === key) {
      return;
    }

    if (current && current !== key) {
      get().flushToolSnapshot();
    }

    set((state) => {
      if (
        state.tool.boundExerciseKey === key &&
        state.activeExerciseKey === key
      ) {
        return state;
      }

      return {
        activeExerciseKey: key,
        tool: {
          ...state.tool,
          boundExerciseKey: key,
        },
      };
    });
  },

  unbindExerciseTool: (key) => {
    const current = get().tool.boundExerciseKey;
    if (current !== key) return;

    get().flushToolSnapshot();

    set((state) => ({
      activeExerciseKey:
        state.activeExerciseKey === key ? null : state.activeExerciseKey,
      tool: {
        ...state.tool,
        boundExerciseKey: null,
      },
    }));
  },

  patchBoundToolWorkspace: (workspace) => {
    const key = get().tool.boundExerciseKey;
    if (!key) return;

    const normalized = normalizeWorkspacePatch({ workspace });

    get().patchExercise(key, normalized);
  },

  setFlushToolSnapshotCallback: (cb) => {
    set({ _flushToolSnapshotCb: cb });
  },

  flushToolSnapshot: () => {
    const cb = get()._flushToolSnapshotCb;
    if (cb) cb();
  },

  flushBeforeNavigation: (callbacks) => {
    get().flushToolSnapshot();
    callbacks?.flushTool?.();
    callbacks?.flushSketch?.();
    callbacks?.flushProgress?.();
  },

  goToCard: (index, callbacks) => {
    get().flushBeforeNavigation(callbacks);
    set({ activeCardIndex: index });
  },

  queueAutosave: () => {
    // DB persistence is bridged by useReviewProgress subscribing to this store.
  },

  flushNow: async () => {
    // DB persistence is bridged by useReviewProgress.
    // This action exists so navigation/tool code has a stable runtime API.
  },
}));
