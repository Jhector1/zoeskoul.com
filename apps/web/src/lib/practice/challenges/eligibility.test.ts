import { describe, expect, it } from "vitest";

import {
  assertEligiblePublicChallengeTarget,
  isEligiblePublicChallengeTarget,
} from "./eligibility";

describe("Public Challenge execution-shape eligibility", () => {
  it("allows code_input independently of curriculum purpose", () => {
    // Named objects intentionally carry exercisePurpose so this test proves
    // the shared helper ignores curriculum purpose. Passing a named object
    // avoids TypeScript's excess-property check on direct object literals.
    const authoredPractice = {
      exerciseKind: "code_input",
      exercisePurpose: "practice",
    };
    const authoredProject = {
      exerciseKind: "code_input",
      exercisePurpose: "project",
    };

    expect(isEligiblePublicChallengeTarget(authoredPractice)).toBe(true);
    expect(isEligiblePublicChallengeTarget(authoredProject)).toBe(true);
  });

  it("rejects non-code-input execution shapes", () => {
    const nonCodeInput = {
      exerciseKind: "single_choice",
      exercisePurpose: "practice",
    };

    expect(isEligiblePublicChallengeTarget(nonCodeInput)).toBe(false);
    expect(() =>
      assertEligiblePublicChallengeTarget(nonCodeInput),
    ).toThrow(/only code_input exercises/i);
  });
});
