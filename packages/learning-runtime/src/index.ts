export type ReviewPracticeCompletionMeta = {
  attempts: number;
  ok: boolean | null;
  finalized?: boolean;
};

export type SavedQuizState = {
  answers: Record<string, any>;
  checkedById: Record<string, boolean>;

  /**
   * Practice state is persisted as learner-owned patches only. Generated
   * answers, validation secrets, and authoring-only keys do not belong here.
   */
  practiceItemPatch?: Record<string, any>;
  practiceMeta?: Record<
    string,
    ReviewPracticeCompletionMeta
  >;

  updatedAt?: number;
  excusedById?: Record<string, boolean>;
};

export type ReviewRuntimeStateV2 = {
  cards?: Record<string, any>;
  exercises?: Record<string, any>;
};

export type ReviewTopicProgress = {
  quizVersion?: number;

  /**
   * Legacy reading completion keyed by old card ids.
   * Retained while saved states migrate to semantic reading keys.
   */
  cardsDone?: Record<string, boolean>;

  /**
   * Durable reading completion keyed by semantic reading units.
   */
  readingDone?: Record<string, boolean>;

  /**
   * Quiz and project completion remains keyed by the assessment card id.
   */
  quizzesDone?: Record<string, boolean>;

  quizState?: Record<string, SavedQuizState>;
  sketchState?: Record<string, any>;
  toolState?: Record<string, any>;

  completed?: boolean;
  completedAt?: string;

  /**
   * Persisted bridge for the integrated learning runtime. This is data only;
   * the Zustand store and React actions remain application-owned.
   */
  runtimeStateV2?: ReviewRuntimeStateV2;
};

export type ReviewProgressState = {
  quizVersion?: number;
  moduleCompleted?: boolean;
  moduleCompletedAt?: string;
  activeTopicId?: string;
  assignmentSessionId?: string | null;
  topics?: Record<string, ReviewTopicProgress>;

  /**
   * Monotonic server/client save revision used to reject stale writes.
   */
  __saveRevision?: number;
};

export function createEmptyReviewProgress():
  ReviewProgressState {
  return {
    topics: {},
    quizVersion: 0,
    moduleCompleted: false,
    moduleCompletedAt: undefined,
  };
}

export {
  getTopicProgressState,
  mergeTopicProgressStates,
  normalizeProgressTopics,
  normalizeTopicProgressKey,
} from "./progressNormalization";

export {
  getReviewProgressSaveRevision,
  mergeReviewProgressForSave,
  reviewProgressStateBytes,
} from "./progressSaveMerge";

export {
  getReviewProgressClientSaveRevision,
  isReviewUserSavedState,
  mergeReviewProgressForConflictRetry,
  normalizeReviewProgressForClientSync,
  reviewSavedStateUpdatedAt,
  withoutReviewProgressSaveRevision,
} from "./progressClientSync";

export {
  canonicalizeReviewExerciseStateKey,
  getReviewSavedWorkspace,
  getSavedReviewExerciseCode,
  getSavedReviewExerciseLanguage,
  getSavedReviewExerciseStdin,
  hasSavedReviewExerciseContent,
  hasSavedReviewExerciseEditorContent,
  isReviewWorkspaceState,
  isScopedReviewExerciseStateKey,
  looksLikeBetterReviewExerciseRestoreCandidate,
  reviewWorkspaceHasNonBlankCode,
  savedReviewExerciseLooksLikeLearnerEditorWork,
  summarizeReviewSavedWorkspaceFiles,
} from "./workspaceRestore";

export {
  buildLessonAssessmentDoneProgress,
  buildLessonCardDoneProgress,
  buildLessonEmbeddedTryItDoneProgress,
  canAutoCompleteLessonCard,
  isLessonCardComplete,
  isLessonEmbeddedTryItPassed,
  isLessonTopicComplete,
  isLessonTopicUnlocked,
  nextLessonPosition,
  previousLessonPosition,
  resolveInitialLessonTopicSlug,
  withActiveLessonTopic,
  type LessonNavigationCard,
  type LessonNavigationTopic,
  type LessonPosition,
} from "./lessonNavigation";
