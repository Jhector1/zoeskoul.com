import { describe, expect, it } from "vitest";

import {
  canRevealPracticeAnswer,
  getFallbackPracticeHintStepKey,
  PRACTICE_REVEAL_FAILURE_THRESHOLD,
} from "./steps";

describe("practice help gating", () => {
  it("keeps reveal hidden until the third unsuccessful attempt", () => {
    expect(PRACTICE_REVEAL_FAILURE_THRESHOLD).toBe(3);
    expect(
      canRevealPracticeAnswer({ allowReveal: true, attempts: 2 }),
    ).toBe(false);
    expect(
      canRevealPracticeAnswer({ allowReveal: true, attempts: 3 }),
    ).toBe(true);
  });

  it("never offers reveal after success, after reveal, or when disabled", () => {
    expect(
      canRevealPracticeAnswer({
        allowReveal: true,
        attempts: 3,
        solved: true,
      }),
    ).toBe(false);
    expect(
      canRevealPracticeAnswer({
        allowReveal: true,
        attempts: 3,
        revealed: true,
      }),
    ).toBe(false);
    expect(
      canRevealPracticeAnswer({ allowReveal: false, attempts: 3 }),
    ).toBe(false);
  });

  it("offers one authored fallback instead of a second hint ladder", () => {
    expect(
      getFallbackPracticeHintStepKey(
        ["concept", "hint_1", "reveal"],
        [],
      ),
    ).toBe("concept");
    expect(
      getFallbackPracticeHintStepKey(
        ["concept", "hint_1", "reveal"],
        ["concept"],
      ),
    ).toBeNull();
    expect(
      getFallbackPracticeHintStepKey(["hint_1", "reveal"], []),
    ).toBe("hint_1");
  });
});
