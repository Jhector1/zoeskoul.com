export type CompactProgressStepStatus = "complete" | "revealed" | "upcoming";

export type CompactQuizNavigationState = {
  quizId: string;
  cardId: string;
  activeIndex: number;
  total: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  /** Distinguishes nested project/quiz progress from an embedded Try It. */
  kind?: "quiz" | "project" | "embedded_try_it";
  /** Completion state for each nested question/project step. */
  stepStatuses?: CompactProgressStepStatus[];
  prevLabel?: string;
  nextLabel?: string;
  onPrev: () => void;
  onNext: () => void;
};
export type CompactModuleBoundaryState = {
  hasNextNestedStep: boolean;
  hasNextCard: boolean;
  hasNextTopic: boolean;
};

/**
 * Module-level navigation belongs only at the true end of the current module.
 * A nested quiz/project step, another card, or another topic must keep the
 * contextual action inside the current module.
 */
export function isAtFinalModuleNavigationStep(
  state: CompactModuleBoundaryState,
): boolean {
  return (
    !state.hasNextNestedStep &&
    !state.hasNextCard &&
    !state.hasNextTopic
  );
}
