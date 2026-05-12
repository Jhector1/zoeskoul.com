import type { WorkspaceStateV2 } from "@/components/ide/types";

export type CardStateKey = string;
export type ExerciseStateKey = string;

export type SketchState = {
  version: number;
  elements: unknown[];
  [key: string]: unknown;
};

export type ExerciseRuntimeStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type WorkspaceOrigin =
  | "starter"
  | "empty"
  | "user"
  | "saved"
  | "restored";

export type ExerciseRuntimeState = {
  exerciseKey: ExerciseStateKey;

  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string;
  topicId: string;
  cardId: string;
  exerciseId: string;

  language: string;

  /**
   * Canonical source of truth for code exercises.
   * Do not treat code/codeStdin as canonical once workspace exists.
   */
  workspace: WorkspaceStateV2;
  stdin: string;

  runner: {
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    tests?: unknown[];
    lastRunAt?: number;
  };

  answer: {
    revealed: boolean;
    solutionCode?: string;
    solutionFiles?: Record<string, string>;
  };

  sketch?: SketchState | null;
  status: ExerciseRuntimeStatus;
  workspaceStatus: "pending" | "ready" | "error";
  workspaceOrigin?: WorkspaceOrigin;
  userEdited?: boolean;
  starterHash?: string;
  updatedAt: number;

  /**
   * Legacy compatibility fields.
   * These are derived from workspace so older components can continue to work.
   */
  code?: string;
  source?: string;
  lang?: string;
  codeWorkspace?: WorkspaceStateV2;
  ideWorkspace?: WorkspaceStateV2;
  codeStdin?: string;

  /** SQL-only runtime metadata. Non-SQL courses must leave these unset. */
  fixedSqlDialect?: string;
  sqlDialect?: string;
  sqlDatasetId?: string;
  sqlDatasetResolutionSource?: string;
  sqlDatasetResolutionError?: string;
  sqlSchemaSql?: string;
  sqlSeedSql?: string;
  sqlInitialTableSnapshots?: unknown;
  runtime?: { kind: "sql"; datasetId?: string; resultShape?: "table" } | Record<string, unknown>;
};

export type CardRuntimeState = {
  cardKey: CardStateKey;
  topicId: string;
  cardId: string;
  visited: boolean;
  completed: boolean;
  sketch?: SketchState | null;
  workspaceStatus: "pending" | "ready" | "error";
  workspaceSeedMode?: "starter" | "empty" | "restored";
  workspaceOrigin?: WorkspaceOrigin;
  userEdited?: boolean;
  starterHash?: string;

  /**
   * Card/sketch-scoped Tools editor workspace.
   * This stores created files/folders from the Tools IDE when no exercise is active.
   */
  toolKey?: string;
  toolWorkspace?: WorkspaceStateV2 | null;
  toolCode?: string;
  toolStdin?: string;
  toolLang?: string;

  updatedAt: number;
};

export type EditorRuntimeState = {
  ownerKey: string;
  ownerKind: "card" | "exercise";
  targetKey: string;
  toolScopeKey: string;
  language: string;
  workspaceStatus: "pending" | "ready" | "error";
  workspaceSeedMode: "starter" | "empty" | "restored";
  workspaceOrigin?: WorkspaceOrigin;
  userEdited?: boolean;
  starterHash?: string;
  workspace: WorkspaceStateV2 | null;
  code: string;
  stdin: string;
  updatedAt: number;
};

export type ReviewRuntimeState = {
  subjectSlug: string | null;
  moduleSlug: string | null;
  sectionSlug?: string | null;

  activeTopicId: string | null;
  viewTopicId: string | null;
  activeCardIndex: number;
  activeExerciseKey: ExerciseStateKey | null;

  /**
   * The current workspace used by the side-car tool (e.g. CodeToolPane).
   * Having this in the root state ensures we have a stable reference
   * that updates immediately when switching exercises.
   */
  boundToolWorkspace: WorkspaceStateV2 | null;

  cards: Record<CardStateKey, CardRuntimeState>;
  exercises: Record<ExerciseStateKey, ExerciseRuntimeState>;
  editorRuntimes: Record<string, EditorRuntimeState>;

  tool: {
    boundExerciseKey: ExerciseStateKey | null;
  };

  persistence: {
    dirty: boolean;
    pendingExerciseKeys: Set<ExerciseStateKey>;
    pendingCardKeys: Set<CardStateKey>;
  };

  targetRegistry: import("./reviewTargetRegistry").ReviewTargetRegistry | null;
};

export type ReviewRuntimeActions = {
  setTargetRegistry: (registry: import("./reviewTargetRegistry").ReviewTargetRegistry) => void;

  setReviewScope: (scope: {
    subjectSlug?: string | null;
    moduleSlug?: string | null;
    sectionSlug?: string | null;
    activeTopicId?: string | null;
    viewTopicId?: string | null;
  }) => void;

  setTopicIds: (
    activeTopicId: string | null,
    viewTopicId: string | null,
  ) => void;

  ensureExercise: (args: {
    exerciseKey: ExerciseStateKey;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug?: string;
    topicId: string;
    cardId: string;
    manifest?: any;
    saved?: any;
  }) => void;

  patchExercise: (
    key: ExerciseStateKey,
    patch: Partial<ExerciseRuntimeState> & Record<string, any>,
  ) => void;

  ensureCard: (args: {
    cardKey: CardStateKey;
    topicId: string;
    cardId: string;
    initial?: Partial<CardRuntimeState>;
    starterSketch?: SketchState | null;
    toolLanguage?: string;
    toolManifest?: any;
    toolKey?: string;
  }) => void;

  patchCard: (
    key: CardStateKey,
    patch: Partial<CardRuntimeState>,
  ) => void;

  ensureEditorSource: (
    source: import("./deterministicEditorSource").ReviewDeterministicEditorSource,
  ) => void;

  patchEditorWorkspace: (
    ownerKey: string,
    workspace: WorkspaceStateV2 | null,
  ) => void;

  bindExerciseTool: (key: ExerciseStateKey) => void;
  unbindExerciseTool: (key: ExerciseStateKey) => void;

  patchBoundToolWorkspace: (workspace: WorkspaceStateV2) => void;

  flushToolSnapshot: () => void;
  setFlushToolSnapshotCallback: (cb: (() => void) | null) => void;

  flushBeforeNavigation: (callbacks?: {
    flushTool?: () => void;
    flushSketch?: () => void;
    flushProgress?: () => void;
  }) => void;

  goToCard: (
    index: number,
    callbacks?: {
      flushTool?: () => void;
      flushSketch?: () => void;
      flushProgress?: () => void;
    },
  ) => void;

  syncActiveTarget: (target: import("./reviewRoute").ReviewResolvedRouteTarget | null) => void;

  queueAutosave: () => void;


  clearRuntimeForTopic: (topicId: string) => void;
  clearRuntimeForCard: (topicId: string, cardId: string) => void;
  clearRuntimeForModule: () => void;
  flushNow: () => Promise<void>;
};

export type ReviewRuntimeStore = ReviewRuntimeState & ReviewRuntimeActions;
