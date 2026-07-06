import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SavedSketchState } from "@/components/sketches/subjects/types";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { TerminalEvidence } from "@/lib/practice/types";

import type { ReviewTargetEntry } from "./reviewTargetRegistry";
export type CardStateKey = string;
export type ExerciseStateKey = string;
export type UnknownRecord = Record<string, unknown>;

export type SketchState = SavedSketchState;

export type ExerciseRuntimeStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type WorkspaceOrigin =
  | "starter"
  | "empty"
  | "user"
  | "saved"
  | "restored"
  | "sync";

export type RuntimeFileEditOrigin =
  | "starter"
  | "learner"
  | "saved"
  | "runtime-shell"
  | "cache";

export type RuntimeFileEditEntry = {
  generation: number;
  origin: RuntimeFileEditOrigin;
  hasUserEdited: boolean;
};

export type RuntimeFileEditState = Record<string, RuntimeFileEditEntry>;

export type RuntimeWorkspaceMutationType =
  | "user-content"
  | "user-structure"
  | "hydrate"
  | "runtime-sync"
  | "cache-sync"
  | "reset";

export type RuntimeWorkspaceMutation = {
  generation: number;
  source: string;
  mutation: RuntimeWorkspaceMutationType;
  changedFilePaths?: string[];
};

export type ResetExerciseToStarterArgs = {
  topicId: string;
  cardId: string;
  exerciseId: string;
  exerciseStateKey?: ExerciseStateKey | null;
};

export type ResetExerciseToStarterResult = {
  exerciseKey: ExerciseStateKey | null;
  resetRevision: number;
  restored: boolean;
};

export type ExerciseRuntimeState = {
  exerciseKey: ExerciseStateKey;
  workspaceGeneration?: number;
  fileEditState?: RuntimeFileEditState;
  starterWorkspace?: WorkspaceStateV2 | null;

  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string;
  topicId: string;
  cardId: string;
  exerciseId: string;

  language: WorkspaceStateV2["language"];

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
  terminalEvidence?: TerminalEvidence;

  sketch?: SketchState | null;
  status: ExerciseRuntimeStatus;
  workspaceStatus: "pending" | "ready" | "error";
  workspaceError?: string | null;
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
  lang?: WorkspaceStateV2["language"];
  codeLang?: WorkspaceStateV2["language"];
  codeWorkspace?: WorkspaceStateV2;
  ideWorkspace?: WorkspaceStateV2;
  codeStdin?: string;
  submitted?: boolean;
  result?: unknown;
  stableExerciseId?: string;
  exerciseStateId?: string;
  slotId?: string;
  key?: string;
  id?: string;

  /** SQL-only runtime metadata. Non-SQL courses must leave these unset. */
  fixedSqlDialect?: string;
  sqlDialect?: string;
  sqlDatasetId?: string;
  sqlDatasetResolutionSource?: string;
  sqlDatasetResolutionError?: string;
  sqlSchemaSql?: string;
  sqlSeedSql?: string;
  sqlInitialTableSnapshots?: unknown;
  ideConfig?: LearningIdeConfig | null;
  manifest?: UnknownRecord | null;
  runtime?: { kind: "sql"; datasetId?: string; resultShape?: "table" } | Record<string, unknown>;
};

export type CardRuntimeState = {
  cardKey: CardStateKey;
  workspaceGeneration?: number;
  fileEditState?: RuntimeFileEditState;
  starterWorkspace?: WorkspaceStateV2 | null;
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
  toolLang?: WorkspaceStateV2["language"];

  updatedAt: number;
};

export type EditorRuntimeState = {
  ownerKey: string;
  workspaceGeneration?: number;
  fileEditState?: RuntimeFileEditState;
  starterWorkspace?: WorkspaceStateV2 | null;
  ownerKind: "card" | "exercise";
  targetKey: string;
  toolScopeKey: string;
  language: WorkspaceStateV2["language"];
  workspaceStatus: "pending" | "ready" | "error";
  workspaceSeedMode: "starter" | "empty" | "restored";
  workspaceOrigin?: WorkspaceOrigin;
  userEdited?: boolean;
  starterHash?: string;
  workspace: WorkspaceStateV2 | null;
  code: string;
  stdin: string;
  terminalEvidence?: TerminalEvidence;
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
   * Monotonic reset generation for mounted review consumers.
   *
   * Progress/runtime reset can happen while QuizBlock and FullIDE stay mounted.
   * Those components use this revision to discard same-tab practice/editor state
   * before an old workspace can be written back into the freshly cleared store.
   */
  resetRevision: number;

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
    manifest?: unknown;
    saved?: unknown;
    entry?: ReviewTargetEntry | null;
  }) => void;

  patchExercise: (
    key: ExerciseStateKey,
    patch: Partial<ExerciseRuntimeState> &
      UnknownRecord & {
        generation?: number;
        updateOrigin?: string;
        workspaceMutation?: RuntimeWorkspaceMutation;
      },
  ) => void;

  ensureCard: (args: {
    cardKey: CardStateKey;
    topicId: string;
    cardId: string;
    initial?: Partial<CardRuntimeState>;
    starterSketch?: SketchState | null;
    toolLanguage?: string;
    toolManifest?: unknown;
    toolKey?: string;
  }) => void;

  patchCard: (
    key: CardStateKey,
    patch: Partial<CardRuntimeState> & {
      generation?: number;
    },
  ) => void;

  ensureEditorSource: (
    source: import("./deterministicEditorSource").ReviewDeterministicEditorSource,
  ) => void;

  patchEditorWorkspace: (
    ownerKey: string,
    workspace: WorkspaceStateV2 | null,
    options?: {
      generation?: number;
      source?: string;
      mutation?: RuntimeWorkspaceMutation;
    },
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

  syncActiveTarget: (
      target: import("./reviewRoute").ReviewResolvedRouteTarget | null,
      registryOverride?: import("./reviewTargetRegistry").ReviewTargetRegistry | null,
  ) => void;
  queueAutosave: () => void;


  clearRuntimeForTopic: (topicId: string) => void;
  clearRuntimeForCard: (topicId: string, cardId: string) => void;
  resetExerciseToStarter: (
    args: ResetExerciseToStarterArgs,
  ) => ResetExerciseToStarterResult;
  clearRuntimeForModule: () => void;
  flushNow: () => Promise<void>;
};

export type ReviewRuntimeStore = ReviewRuntimeState & ReviewRuntimeActions;
