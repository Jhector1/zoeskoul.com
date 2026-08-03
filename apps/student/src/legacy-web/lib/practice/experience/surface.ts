import type { PracticeExperienceMode } from "./types";
import { getPracticeExperienceRuntimePolicy } from "./routePolicy";

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
  return getPracticeExperienceRuntimePolicy(args.mode).workspace;
}

export function usesPracticeToolsSurface(args: {
  mode: PracticeExperienceMode;
  exerciseKind?: string | null;
}) {
  return resolvePracticeExerciseSurface(args) === "tools";
}
