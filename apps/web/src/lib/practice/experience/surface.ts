import type { PracticeExperienceMode } from "./types";

export type PracticeExerciseSurface = "embedded" | "tools";

/**
 * Standalone practice presentation policy.
 *
 * Review-module rendering is intentionally untouched. Assignments and the
 * onboarding trial keep the compact embedded UI. Daily practice, public
 * challenges, and subscriber practice mount the review-style workspace shell
 * immediately, including while the exercise is still loading.
 */
export function resolvePracticeExerciseSurface(args: {
  mode: PracticeExperienceMode;
  exerciseKind?: string | null;
}): PracticeExerciseSurface {
  const { mode, exerciseKind } = args;

  if (mode === "assignment" || mode === "onboarding_trial") {
    return "embedded";
  }

  if (
    mode === "daily_five" ||
    mode === "public_challenge" ||
    mode === "standard" ||
    mode === "practice"
  ) {
    // The practice page keeps the review shell for every question. The tools
    // rail binds only when the loaded exercise supports a code workspace.
    return "tools";
  }

  return exerciseKind === "code_input" ? "tools" : "embedded";
}

export function usesPracticeToolsSurface(args: {
  mode: PracticeExperienceMode;
  exerciseKind?: string | null;
}) {
  return resolvePracticeExerciseSurface(args) === "tools";
}
