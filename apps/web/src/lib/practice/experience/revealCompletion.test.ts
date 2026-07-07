import { describe, expect, it } from "vitest";

import { resolveRevealCompletionTransition } from "./revealCompletion";

describe("practice reveal completion transition", () => {
  it("finishes review-style practice experiences immediately", () => {
    expect(resolveRevealCompletionTransition("daily_five")).toBe("immediate");
    expect(resolveRevealCompletionTransition("public_challenge")).toBe("immediate");
    expect(resolveRevealCompletionTransition("standard")).toBe("immediate");
    expect(resolveRevealCompletionTransition("practice")).toBe("immediate");
  });

  it("keeps the explicit continue step for embedded assignment and trial flows", () => {
    expect(resolveRevealCompletionTransition("assignment")).toBe("explicit");
    expect(resolveRevealCompletionTransition("onboarding_trial")).toBe("explicit");
  });
});
