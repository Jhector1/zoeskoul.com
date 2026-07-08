import { describe, expect, it } from "vitest";

import {
  assertEligiblePublicChallengeTarget,
  isEligiblePublicChallengeTarget,
} from "./eligibility";

describe("public challenge eligibility", () => {
  it("accepts only code_input projects", () => {
    expect(
      isEligiblePublicChallengeTarget({
        exercisePurpose: "project",
        exerciseKind: "code_input",
      }),
    ).toBe(true);

    expect(
      isEligiblePublicChallengeTarget({
        exercisePurpose: "quiz",
        exerciseKind: "single_choice",
      }),
    ).toBe(false);
  });

  it("rejects non-code projects at the server boundary", () => {
    expect(() =>
      assertEligiblePublicChallengeTarget({
        exercisePurpose: "project",
        exerciseKind: "drag_reorder",
      }),
    ).toThrow(/only code_input project exercises/i);
  });
});
