import type { PracticeExperienceMode } from "@/lib/practice/experience/types";

export function shouldShowPracticeLeaderboard(mode: PracticeExperienceMode) {
  return mode !== "assignment" && mode !== "onboarding_trial";
}

/**
 * A learner who is already inside Daily Practice should not be offered a
 * link that starts the same experience again. Other practice experiences may
 * still use the leaderboard rail as a route into the daily ranked session.
 */
export function shouldShowDailyPracticeLaunchCta(
  mode: PracticeExperienceMode,
) {
  return mode !== "daily_five";
}
