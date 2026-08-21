import { describe, expect, it } from "vitest";

import { resolvePracticeProgressCounts } from "./practiceProgressCounts";

describe("resolvePracticeProgressCounts", () => {
  it("uses canonical server completion when a sessionless browser stack is empty", () => {
    expect(
      resolvePracticeProgressCounts({
        localAnswered: 0,
        localCorrect: 0,
        serverStatus: {
          answeredCount: 2,
          totalCount: 2,
          correctCount: 2,
        },
        subscriberPractice: {
          completedPrefix: [{ correct: true }, { correct: true }],
        },
      }),
    ).toEqual({
      answeredCount: 2,
      correctCount: 2,
    });
  });

  it("uses canonical completedPrefix even when a stale server snapshot reports zero", () => {
    expect(
      resolvePracticeProgressCounts({
        localAnswered: 0,
        localCorrect: 0,
        serverStatus: {
          answeredCount: 0,
          totalCount: 0,
          correctCount: 0,
        },
        subscriberPractice: {
          completedPrefix: [{ correct: true }, { correct: false }],
        },
      }),
    ).toEqual({
      answeredCount: 2,
      correctCount: 1,
    });
  });

  it("does not reduce progress already present in the local run", () => {
    expect(
      resolvePracticeProgressCounts({
        localAnswered: 3,
        localCorrect: 2,
        serverStatus: {
          answeredCount: 2,
          totalCount: 2,
          correctCount: 1,
        },
        subscriberPractice: {
          completedPrefix: [{ correct: true }, { correct: false }],
        },
      }),
    ).toEqual({
      answeredCount: 3,
      correctCount: 2,
    });
  });
});
