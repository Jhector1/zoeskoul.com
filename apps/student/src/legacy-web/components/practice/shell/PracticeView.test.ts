import { describe, expect, it } from "vitest";

import {
  shouldShowDailyPracticeLaunchCta,
  shouldShowPracticeLeaderboard,
} from "../leaderboard/visibility";

describe("shouldShowPracticeLeaderboard", () => {
  it.each([
    "practice",
    "standard",
    "daily_five",
    "public_challenge",
  ] as const)("shows rankings for %s", (mode) => {
    expect(shouldShowPracticeLeaderboard(mode)).toBe(true);
  });

  it.each(["assignment", "onboarding_trial"] as const)(
    "keeps rankings out of %s",
    (mode) => {
      expect(shouldShowPracticeLeaderboard(mode)).toBe(false);
    },
  );
});

describe("shouldShowDailyPracticeLaunchCta", () => {
  it("does not offer to start Daily Practice from inside Daily Practice", () => {
    expect(shouldShowDailyPracticeLaunchCta("daily_five")).toBe(false);
  });

  it.each([
    "practice",
    "standard",
    "public_challenge",
    "assignment",
    "onboarding_trial",
  ] as const)("may offer Daily Practice from %s", (mode) => {
    expect(shouldShowDailyPracticeLaunchCta(mode)).toBe(true);
  });
});
