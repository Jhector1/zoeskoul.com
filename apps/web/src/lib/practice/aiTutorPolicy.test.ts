import { describe, expect, it } from "vitest";

import {
  AI_TUTOR_FAILURE_THRESHOLD,
  hasReachedAiTutorFailureThreshold,
  resolveAiTutorFailureCount,
} from "./aiTutorPolicy";

describe("AI tutor failure policy", () => {
  it("offers help after two failures", () => {
    expect(AI_TUTOR_FAILURE_THRESHOLD).toBe(2);
    expect(hasReachedAiTutorFailureThreshold(1)).toBe(false);
    expect(hasReachedAiTutorFailureThreshold(2)).toBe(true);
  });

  it("reconciles persisted and current learner state", () => {
    expect(
      resolveAiTutorFailureCount({
        persistedFailures: 1,
        reportedFailures: 2,
      }),
    ).toBe(2);

    expect(
      resolveAiTutorFailureCount({
        persistedFailures: 3,
        reportedFailures: 2,
      }),
    ).toBe(3);
  });

  it("ignores invalid counts", () => {
    expect(
      resolveAiTutorFailureCount({
        persistedFailures: Number.NaN,
        reportedFailures: -4,
      }),
    ).toBe(0);
  });
});
