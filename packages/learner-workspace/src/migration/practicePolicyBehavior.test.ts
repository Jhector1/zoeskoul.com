import { describe, expect, it } from "vitest";

import { resolveRevealCompletionTransition } from "../practice/experience/revealCompletion";
import {
  resolvePracticeDisplayStack,
  resolvePracticeQueuePlaceholderStatus,
} from "../practice/experience/reviewDisplayStack";
import { resolvePracticeQueueStatus } from "../practice/experience/queueStatus";
import {
  shouldShowDailyPracticeLaunchCta,
  shouldShowPracticeLeaderboard,
} from "../practice/leaderboard/visibility";

describe("shared Practice policy behavior", () => {
  it("keeps reveal completion explicit", () => {
    expect(resolveRevealCompletionTransition("daily_five")).toBe("explicit");
    expect(resolveRevealCompletionTransition(null)).toBe("explicit");
  });

  it("preserves leaderboard visibility policy", () => {
    expect(shouldShowPracticeLeaderboard("assignment")).toBe(false);
    expect(shouldShowPracticeLeaderboard("onboarding_trial")).toBe(false);
    expect(shouldShowPracticeLeaderboard("daily_five")).toBe(true);
    expect(shouldShowDailyPracticeLaunchCta("daily_five")).toBe(false);
    expect(shouldShowDailyPracticeLaunchCta("practice")).toBe(true);
  });

  it("preserves display-stack and placeholder selection", () => {
    const local = [{ id: "local" }];
    const review = [{ id: "review-1" }, { id: "review-2" }];

    expect(
      resolvePracticeDisplayStack({
        stack: local,
        reviewStack: review,
        answeredCount: 2,
      }),
    ).toBe(review);

    expect(
      resolvePracticeQueuePlaceholderStatus({
        index: 0,
        answeredCount: 1,
      }),
    ).toBe("completed");

    expect(
      resolvePracticeQueuePlaceholderStatus({
        index: 1,
        answeredCount: 1,
      }),
    ).toBe("not_started");
  });

  it("preserves queue status precedence", () => {
    expect(resolvePracticeQueueStatus(null)).toBe("not_started");
    expect(
      resolvePracticeQueueStatus({
        result: { ok: true },
        submitted: true,
      }),
    ).toBe("correct");
    expect(
      resolvePracticeQueueStatus({
        revealed: true,
        submitted: true,
      }),
    ).toBe("revealed");
    expect(
      resolvePracticeQueueStatus({
        submitted: true,
      }),
    ).toBe("completed");
    expect(
      resolvePracticeQueueStatus({
        attempts: 1,
      }),
    ).toBe("in_progress");
  });
});
