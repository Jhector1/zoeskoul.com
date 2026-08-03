import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasCheckableReviewPracticeInput,
} from "./reviewPracticeSubmitAvailability";

describe("hasCheckableReviewPracticeInput", () => {
  it("accepts normal rendered input", () => {
    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: true,
        toolsActive: false,
        toolsAvailable: false,
        isCodeExercise: false,
      }),
    ).toBe(true);
  });

  it("allows a server-ready Tools code exercise to flush live Monaco input", () => {
    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: false,
        toolsActive: true,
        toolsAvailable: true,
        isCodeExercise: true,
      }),
    ).toBe(true);
  });

  it("does not disable a visible Tools code exercise while signed state catches up", () => {
    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: false,
        toolsActive: true,
        toolsAvailable: true,
        isCodeExercise: true,
      }),
    ).toBe(true);
  });

  it("does not relax embedded code or non-code input requirements", () => {
    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: false,
        toolsActive: false,
        toolsAvailable: true,
        isCodeExercise: true,
      }),
    ).toBe(false);

    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: false,
        toolsActive: true,
        toolsAvailable: true,
        isCodeExercise: false,
      }),
    ).toBe(false);
  });

  it("requires an actual Tools provider before allowing deferred input", () => {
    expect(
      hasCheckableReviewPracticeInput({
        hasRenderedInput: false,
        toolsActive: true,
        toolsAvailable: false,
        isCodeExercise: true,
      }),
    ).toBe(false);
  });
});
