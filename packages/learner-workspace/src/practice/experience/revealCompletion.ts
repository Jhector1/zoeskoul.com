export type RevealCompletionTransition = "explicit";

/**
 * Revealing finalizes the current item with zero credit, but never navigates
 * automatically. The learner explicitly chooses Next or Finish.
 */
export function resolveRevealCompletionTransition(
  _mode: string | null | undefined,
): RevealCompletionTransition {
  return "explicit";
}
