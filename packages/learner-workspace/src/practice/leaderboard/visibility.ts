export function shouldShowPracticeLeaderboard(mode: string) {
  return mode !== "assignment" && mode !== "onboarding_trial";
}

/**
 * A learner already inside Daily Practice should not be offered a CTA that
 * starts the same experience again.
 */
export function shouldShowDailyPracticeLaunchCta(mode: string) {
  return mode !== "daily_five";
}
