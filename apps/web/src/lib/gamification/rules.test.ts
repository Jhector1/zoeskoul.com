import { describe, expect, it } from "vitest";

import { getAttemptXpRule } from "./rules";

describe("practice XP rules", () => {
  it("rewards difficulty without making reveal worth points", () => {
    expect(
      getAttemptXpRule({
        ok: true,
        isReveal: false,
        priorNonRevealAttempts: 0,
        difficulty: "easy",
      })?.xpDelta,
    ).toBe(10);
    expect(
      getAttemptXpRule({
        ok: true,
        isReveal: false,
        priorNonRevealAttempts: 0,
        difficulty: "hard",
      })?.xpDelta,
    ).toBe(30);
    expect(
      getAttemptXpRule({
        ok: false,
        isReveal: true,
        priorNonRevealAttempts: 0,
        difficulty: "hard",
      }),
    ).toBeNull();
  });

  it("reduces XP after retries and hints", () => {
    const clean = getAttemptXpRule({
      ok: true,
      isReveal: false,
      priorNonRevealAttempts: 0,
      difficulty: "medium",
    });
    const helpedRetry = getAttemptXpRule({
      ok: true,
      isReveal: false,
      priorNonRevealAttempts: 1,
      difficulty: "medium",
      helpStepKeys: ["hint_1"],
    });

    expect(clean?.xpDelta).toBe(20);
    expect(helpedRetry?.xpDelta).toBe(11);
  });
});
