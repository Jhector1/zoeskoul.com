import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveReviewPracticeQuestionCompleted,
  shouldBlockReviewPracticeQuestionAction,
} from "./reviewPracticeCompletionScope";

describe("resolveReviewPracticeQuestionCompleted", () => {
  it("does not let restored parent completion finalize an unattempted child", () => {
    expect(
      resolveReviewPracticeQuestionCompleted({
        parentCompleted: true,
        questionFlowDone: false,
      }),
    ).toBe(false);
  });

  it("preserves completion when the parent and exact child are both done", () => {
    expect(
      resolveReviewPracticeQuestionCompleted({
        parentCompleted: true,
        questionFlowDone: true,
      }),
    ).toBe(true);
  });

  it("does not invent parent completion from child flow state", () => {
    expect(
      resolveReviewPracticeQuestionCompleted({
        parentCompleted: false,
        questionFlowDone: true,
      }),
    ).toBe(false);
  });
});

describe("shouldBlockReviewPracticeQuestionAction", () => {
  it("allows an incomplete unlocked question even when its parent was completed", () => {
    expect(
      shouldBlockReviewPracticeQuestionAction({
        locked: false,
        questionCompleted: false,
      }),
    ).toBe(false);
  });

  it("blocks the exact completed question", () => {
    expect(
      shouldBlockReviewPracticeQuestionAction({
        locked: false,
        questionCompleted: true,
      }),
    ).toBe(true);
  });

  it("preserves the lock guard", () => {
    expect(
      shouldBlockReviewPracticeQuestionAction({
        locked: true,
        questionCompleted: false,
      }),
    ).toBe(true);
  });
});
