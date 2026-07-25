import { describe, expect, it } from "vitest";
import { resolveRevealCompletionTransition } from "./revealCompletion";

describe("reveal completion transition", () => {
  it.each([
    "practice",
    "standard",
    "daily_five",
    "public_challenge",
    "assignment",
    "onboarding_trial",
  ] as const)("keeps %s on the revealed exercise until explicit navigation", (mode) => {
    expect(resolveRevealCompletionTransition(mode)).toBe("explicit");
  });
});
