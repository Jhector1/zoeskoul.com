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
  updatedAt: number;

  /**
   * Legacy compatibility fields.
   * These are derived from workspace so older components can continue to work.
   */
  code?: string;
  lang?: string;
  codeWorkspace?: WorkspaceStateV2;
  ideWorkspace?: WorkspaceStateV2;
  codeStdin?: string;
};

export type CardRuntimeState = {
  cardKey: CardStateKey;
  topicId: string;
  cardId: string;
  visited: boolean;
  completed: boolean;
  sketch?: SketchState | null;

  /**
   * Card/sketch-scoped Tools editor workspace.
   * This stores created files/folders from the Tools IDE when no exercise is active.
   */
  toolKey?: string;
  toolWorkspace?: any | null;
  toolCode?: string;
  toolStdin?: string;
  toolLang?: string;

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

  cards: Record<CardStateKey, CardRuntimeState>;
  exercises: Record<ExerciseStateKey, ExerciseRuntimeState>;

  tool: {
    boundExerciseKey: ExerciseStateKey | null;
  };

  persistence: {
    dirty: boolean;
    pendingExerciseKeys: Set<ExerciseStateKey>;
    pendingCardKeys: Set<CardStateKey>;
  };
};

export type ReviewRuntimeActions = {
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
    manifest: any;
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
  }) => void;

  patchCard: (
    key: CardStateKey,
    patch: Partial<CardRuntimeState>,
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

  queueAutosave: () => void;
  flushNow: () => Promise<void>;
};

export type ReviewRuntimeStore = ReviewRuntimeState & ReviewRuntimeActions;
