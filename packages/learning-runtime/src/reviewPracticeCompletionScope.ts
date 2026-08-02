export type ReviewPracticeCompletionScope = {
  parentCompleted: boolean;
  questionFlowDone: boolean;
};

/**
 * The parent quiz/project card and its active practice question have different
 * completion identities.
 *
 * Historical card completion may be restored before a newly authored or
 * independently persisted practice step has been attempted. The parent flag
 * may disable a child only when that exact child is also complete according to
 * the question-level flow state.
 */
export function resolveReviewPracticeQuestionCompleted(
  state: ReviewPracticeCompletionScope,
): boolean {
  return Boolean(
    state.parentCompleted &&
      state.questionFlowDone,
  );
}

export type ReviewPracticeQuestionActionState = {
  locked: boolean;
  questionCompleted: boolean;
};

export function shouldBlockReviewPracticeQuestionAction(
  state: ReviewPracticeQuestionActionState,
): boolean {
  return Boolean(
    state.locked ||
      state.questionCompleted,
  );
}
