import { create } from "zustand";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type {
  CardRuntimeState,
  ExerciseRuntimeState,
  ReviewRuntimeStore,
} from "./reviewRuntimeTypes";
import { getCardStateKey } from "./exerciseKeys";
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

function cardWorkspaceFileSummary(workspace: WorkspaceStateV2 | null | undefined) {
  if (!isWorkspace(workspace)) return [];

  return workspace.nodes
    .filter((node: any) => node?.kind === "file")
    .map((node: any) => String(node.name ?? ""));
}

function manifestStarterFileNames(manifest: any) {
  const starterFiles =
    manifest?.workspace?.starterFiles ??
    manifest?.starterFiles ??
    manifest?.files ??
    manifest?.initialFiles ??
    manifest?.workspaceFiles ??
    manifest?.recipe?.starterFiles ??
    null;

  if (!starterFiles || typeof starterFiles !== "object") return [];

  return Object.keys(starterFiles)
    .map((name) => String(name).split("/").filter(Boolean).pop() || String(name))
    .filter(Boolean)
    .sort();
}

function workspaceContainsStarterFileNames(
  workspace: WorkspaceStateV2 | null | undefined,
  starterFileNames: string[],
) {
  if (!starterFileNames.length) return true;
  if (!isWorkspace(workspace)) return false;

  const existingNames = new Set(cardWorkspaceFileSummary(workspace));
  return starterFileNames.every((name) => existingNames.has(name));
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
function manifestHasStarterWorkspaceSeed(manifest: any) {
  return !!(
    manifest?.workspace ||
    manifest?.starterFiles ||
    manifest?.files ||
    manifest?.initialFiles ||
    manifest?.workspaceFiles ||
    manifest?.recipe?.starterFiles
  );
}

function workspaceFileCount(workspace: WorkspaceStateV2 | null | undefined) {
  if (!isWorkspace(workspace)) return 0;

  return workspace.nodes.filter((node: any) => node?.kind === "file").length;
}
function getFinalExerciseIdFromKey(key: string) {
  const parts = String(key ?? "").split(":").filter(Boolean);
  return parts[parts.length - 1] || key;
}

function canonicalCardKeyForState(args: {
  state: ReviewRuntimeStore;
  key: string;
  topicId?: string | null;
  cardId?: string | null;
}) {
  if (typeof args.key === "string" && args.key.includes(":") && !args.key.endsWith(":general")) {
    return args.key;
  }

  if (!args.topicId || !args.cardId) {
    return args.key;
  }

  return getCardStateKey({
    subjectSlug: args.state.subjectSlug,
    moduleSlug: args.state.moduleSlug,
    sectionSlug: args.state.sectionSlug,
    topicId: args.topicId,
    cardId: args.cardId,
  });
}

function cardStateEqual(a: CardRuntimeState | undefined, b: CardRuntimeState) {
  if (!a) return false;

  return (
    a.cardKey === b.cardKey &&
    a.topicId === b.topicId &&
    a.cardId === b.cardId &&
    a.visited === b.visited &&
    a.completed === b.completed &&
    JSON.stringify(a.sketch ?? null) === JSON.stringify(b.sketch ?? null) &&
    JSON.stringify(a.toolWorkspace ?? null) === JSON.stringify(b.toolWorkspace ?? null) &&
    String(a.toolCode ?? "") === String(b.toolCode ?? "") &&
    String(a.toolStdin ?? "") === String(b.toolStdin ?? "") &&
    String(a.toolLang ?? "") === String(b.toolLang ?? "")
  );
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
      const existing = state.exercises[exerciseKey];

      /**
       * Critical:
       * ensureExercise creates the runtime exercise once.
       *
       * After the exercise exists, IDE edits must flow through patchExercise /
       * setToolWorkspace. Re-running starter resolution here can create update
       * loops while the learner edits files.
       */
      if (existing) {
        return state;
      }

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
      } as any;

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
    const {
      cardKey,
      topicId,
      cardId,
      initial,
      starterToolManifest,
    } = args as any;

    set((state) => {
      const canonicalCardKey = canonicalCardKeyForState({
        state,
        key: cardKey,
        topicId,
        cardId,
      });
      const existing = state.cards[canonicalCardKey];

      const enabled =
          typeof window !== "undefined" &&
          window.localStorage.getItem("zoe:debug:starter-files") === "1";

      const starterLanguage =
          starterToolManifest?.runtime?.language ??
          starterToolManifest?.language ??
          "python";

      const hasStarterWorkspaceSeed = manifestHasStarterWorkspaceSeed(starterToolManifest);
      const expectedStarterFileNames = manifestStarterFileNames(starterToolManifest);

      /**
       * For starter-backed sketch/card workspaces, never blindly trust existing
       * runtime state. It may have been polluted by an exercise workspace from
       * a previous bad path.
       *
       * Example bug:
       *   current sketch expects: main.py + notes.md
       *   existing workspace has: main.py + helper_notes.md
       *
       * That existing workspace must be rejected and reseeded from the current
       * sketch manifest.
       */
      const existingMatchesCurrentStarter =
        !hasStarterWorkspaceSeed ||
        workspaceContainsStarterFileNames(
          existing?.toolWorkspace,
          expectedStarterFileNames,
        );

      const shouldReseedStarterWorkspace =
        hasStarterWorkspaceSeed &&
        (
          !existing?.toolWorkspace ||
          !existingMatchesCurrentStarter
        );

      const starterWorkspace = shouldReseedStarterWorkspace
        ? resolveExerciseWorkspace({
            language: starterLanguage,
            manifest: starterToolManifest,
            saved: null,
          })
        : null;

      const toolWorkspace =
        hasStarterWorkspaceSeed
          ? existingMatchesCurrentStarter
            ? existing?.toolWorkspace ?? starterWorkspace ?? null
            : starterWorkspace
          : existing?.toolWorkspace ??
            initial?.toolWorkspace ??
            starterWorkspace ??
            null;

      const toolCode =
        hasStarterWorkspaceSeed
          ? deriveCodeFromWorkspace(toolWorkspace)
          : typeof existing?.toolCode === "string"
            ? existing.toolCode
            : typeof initial?.toolCode === "string"
              ? initial.toolCode
              : deriveCodeFromWorkspace(toolWorkspace);

      const toolStdin =
        hasStarterWorkspaceSeed
          ? typeof toolWorkspace?.stdin === "string"
            ? toolWorkspace.stdin
            : ""
          : typeof existing?.toolStdin === "string"
            ? existing.toolStdin
            : typeof initial?.toolStdin === "string"
              ? initial.toolStdin
              : typeof toolWorkspace?.stdin === "string"
                ? toolWorkspace.stdin
                : "";

      const nextCard: CardRuntimeState = {
        cardKey: canonicalCardKey,
        topicId: existing?.topicId ?? topicId,
        cardId: existing?.cardId ?? cardId,
        visited: initial?.visited ?? existing?.visited ?? false,
        completed: initial?.completed ?? existing?.completed ?? false,
        sketch: initial?.sketch ?? existing?.sketch ?? null,
        toolKey:
          existing?.toolKey ??
          (typeof initial?.toolKey === "string" ? initial.toolKey : `${canonicalCardKey}:general`),
        toolWorkspace,
        toolCode,
        toolStdin,
        toolLang:
          existing?.toolLang ??
          initial?.toolLang ??
          toolWorkspace?.language ??
          starterLanguage,
        updatedAt: Date.now(),
      };

      if (enabled) {
          console.groupCollapsed(`[starter-files] ensureCard: ${canonicalCardKey}`);
          console.log({
              action: shouldReseedStarterWorkspace
                ? "reseeded-from-current-starter"
                : existing?.toolWorkspace
                  ? "trusted"
                  : starterWorkspace
                    ? "created"
                    : "seeded",
              cardKey: canonicalCardKey,
              topicId,
              cardId,
              hasStarterWorkspaceSeed,
              expectedStarterFileNames,
              existingMatchesCurrentStarter,
              shouldReseedStarterWorkspace,
              existingFiles: cardWorkspaceFileSummary(existing?.toolWorkspace),
              nextFiles: cardWorkspaceFileSummary(nextCard.toolWorkspace),
              starterManifest: starterToolManifest,
          });
          console.groupEnd();
      }

      if (cardStateEqual(existing, nextCard)) {
        return state;
      }

      const nextPending = new Set(state.persistence.pendingCardKeys);
      nextPending.add(canonicalCardKey);

      return {
        cards: {
          ...state.cards,
          [canonicalCardKey]: nextCard,
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




  patchCard: (key, patch) => {
    set((state) => {
      const incomingTopicId =
        typeof (patch as any)?.topicId === "string"
          ? String((patch as any).topicId)
          : null;

      const incomingCardId =
        typeof (patch as any)?.cardId === "string"
          ? String((patch as any).cardId)
          : null;

      const targetKey = canonicalCardKeyForState({
        state,
        key,
        topicId: incomingTopicId,
        cardId: incomingCardId,
      });
      const existing = state.cards[targetKey];

      const fallback: CardRuntimeState = {
        cardKey: targetKey,
        topicId:
          existing?.topicId ??
          (typeof (patch as any)?.topicId === "string"
            ? String((patch as any).topicId)
            : state.viewTopicId ?? "unknown"),
        cardId:
          existing?.cardId ??
          (typeof (patch as any)?.cardId === "string"
            ? String((patch as any).cardId)
            : targetKey),
        visited: existing?.visited ?? false,
        completed: existing?.completed ?? false,
        sketch: existing?.sketch ?? null,
        updatedAt: Date.now(),
      };

      const nextCard: CardRuntimeState = {
        ...fallback,
        ...existing,
        ...patch,
        cardKey: targetKey,
        topicId:
          typeof (patch as any)?.topicId === "string"
            ? String((patch as any).topicId)
            : existing?.topicId ?? fallback.topicId,
        cardId:
          typeof (patch as any)?.cardId === "string"
            ? String((patch as any).cardId)
            : existing?.cardId ?? fallback.cardId,
        updatedAt: Date.now(),
      };

      if (cardStateEqual(existing, nextCard)) {
        return state;
      }

      const nextPending = new Set(state.persistence.pendingCardKeys);
      nextPending.add(targetKey);

      const nextCards = { ...state.cards, [targetKey]: nextCard };

      if (key !== targetKey && nextCards[key]) {
        delete nextCards[key];
      }

      return {
        cards: nextCards,
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
