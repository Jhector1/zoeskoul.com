import type { PracticeExperienceMode } from "./types";

export type RevealCompletionTransition = "explicit";

/**
 * Revealing an answer finalizes the current item with zero credit, but never
 * navigates away automatically. Every practice surface keeps the revealed
 * solution on screen until the learner presses Next or Finish.
 */
export function resolveRevealCompletionTransition(
  _mode: PracticeExperienceMode | null | undefined,
): RevealCompletionTransition {
  return "explicit";
}
