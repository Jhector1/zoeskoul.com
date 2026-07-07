import { describe, expect, it } from "vitest";
import { resolvePracticeExerciseSurface } from "./surface";

describe("resolvePracticeExerciseSurface", () => {
  it("keeps assignments and onboarding trials embedded", () => {
    expect(resolvePracticeExerciseSurface({ mode: "assignment", exerciseKind: "code_input" })).toBe("embedded");
    expect(resolvePracticeExerciseSurface({ mode: "onboarding_trial", exerciseKind: "code_input" })).toBe("embedded");
  });

  it("uses the review-style workspace immediately for daily, challenge, and subscriber practice", () => {
    expect(resolvePracticeExerciseSurface({ mode: "daily_five", exerciseKind: null })).toBe("tools");
    expect(resolvePracticeExerciseSurface({ mode: "public_challenge", exerciseKind: null })).toBe("tools");
    expect(resolvePracticeExerciseSurface({ mode: "standard", exerciseKind: null })).toBe("tools");
  });
});
