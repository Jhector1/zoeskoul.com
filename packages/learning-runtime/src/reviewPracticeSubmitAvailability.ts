export type ReviewPracticeSubmitInputState = {
  hasRenderedInput: boolean;
  toolsActive: boolean;
  toolsAvailable: boolean;
  isCodeExercise: boolean;
};

/**
 * Embedded and non-code exercises continue to require an answer already
 * represented in React state.
 *
 * A Tools code editor is different: Monaco intentionally keeps keystrokes
 * local to prevent controlled-editor blinking. The submit handler flushes
 * that live workspace before validation, so a stale render-time snapshot must
 * not disable the learner's only grading action once the exercise is shown
 * on a live Tools surface. Signed-key and ownership enforcement remain in the
 * submit/validation path, where failures can be reported instead of silently
 * trapping the learner behind a disabled button.
 */
export function hasCheckableReviewPracticeInput(
  state: ReviewPracticeSubmitInputState,
): boolean {
  if (state.hasRenderedInput) {
    return true;
  }

  return Boolean(
    state.toolsActive &&
      state.toolsAvailable &&
      state.isCodeExercise,
  );
}
