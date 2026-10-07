import type { PracticeExperienceMode } from "@zoeskoul/learner-workspace/practice/experience/types";
import {
  shouldShowDailyPracticeLaunchCta as shouldShowSharedDailyPracticeLaunchCta,
  shouldShowPracticeLeaderboard as shouldShowSharedPracticeLeaderboard,
} from "@zoeskoul/learner-workspace/practice/leaderboard/visibility";

export function shouldShowPracticeLeaderboard(
  mode: PracticeExperienceMode,
) {
  return shouldShowSharedPracticeLeaderboard(mode);
}

export function shouldShowDailyPracticeLaunchCta(
  mode: PracticeExperienceMode,
) {
  return shouldShowSharedDailyPracticeLaunchCta(mode);
}
