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
