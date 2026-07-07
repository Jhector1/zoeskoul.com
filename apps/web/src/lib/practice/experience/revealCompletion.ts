import type { PracticeExperienceMode } from "./types";

export type RevealCompletionTransition = "immediate" | "explicit";

/**
 * Revealing an answer finalizes the current practice item with zero credit.
 *
 * Review-style workspaces do not have the old standalone result panel that
 * carried a separate "Continue" button, so their completion transition must
 * happen immediately when the server says the session is complete. Embedded
 * assignment/trial flows keep the explicit acknowledgement step so the learner
 * can inspect the revealed answer before leaving the question.
 */
export function resolveRevealCompletionTransition(
  mode: PracticeExperienceMode | null | undefined,
): RevealCompletionTransition {
  if (mode === "assignment" || mode === "onboarding_trial") {
    return "explicit";
  }

  return "immediate";
}
