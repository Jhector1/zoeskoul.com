export type CompactQuizNavigationState = {
  quizId: string;
  cardId: string;
  activeIndex: number;
  total: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  prevLabel?: string;
  nextLabel?: string;
  onPrev: () => void;
  onNext: () => void;
};
