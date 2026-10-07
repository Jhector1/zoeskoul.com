import { describe, expect, it } from "vitest";

import {
  resolveEmbeddedPracticeWorkspacePresentation,
} from "../practice/experience/embeddedWorkspace";
import {
  isStandaloneAnswerResolved,
  resolveStandaloneAutoAdvanceEnabled,
  resolveStandaloneFinalizedAction,
  supportsStandaloneAutoAdvance,
} from "../practice/review/standaloneAutoAdvance";
import {
  asJsonRecord,
  runtimeString,
  studentRuntimeDifficulty,
} from "../lib/learning/studentRuntimePracticeDescriptorShared";

describe("Practice runtime core behavior", () => {
  it("preserves embedded workspace presentation policy", () => {
    expect(
      resolveEmbeddedPracticeWorkspacePresentation("assignment")?.testId,
    ).toBe("assignment-review-workspace");

    expect(
      resolveEmbeddedPracticeWorkspacePresentation(
        "onboarding_trial",
      )?.testId,
    ).toBe("onboarding-trial-review-workspace");

    expect(
      resolveEmbeddedPracticeWorkspacePresentation("daily_five"),
    ).toBeNull();
  });

  it("preserves standalone auto-advance mode policy", () => {
    expect(
      supportsStandaloneAutoAdvance("daily_five"),
    ).toBe(true);

    expect(
      resolveStandaloneAutoAdvanceEnabled({
        mode: "onboarding_trial",
        preferenceEnabled: false,
      }),
    ).toBe(true);

    expect(
      resolveStandaloneAutoAdvanceEnabled({
        mode: "public_challenge",
        preferenceEnabled: true,
      }),
    ).toBe(false);
  });

  it("preserves finalized action policy", () => {
    expect(
      resolveStandaloneFinalizedAction({
        phase: "summary",
        currentIndex: 0,
        sessionSize: 3,
        canGoNext: true,
      }),
    ).toBeNull();

    expect(
      resolveStandaloneFinalizedAction({
        phase: "practice",
        currentIndex: 2,
        sessionSize: 3,
        canGoNext: true,
        pendingRevealCompletion: true,
        hasFinishRevealedSession: true,
      }),
    ).toBe("finish");
  });

  it("preserves answer-resolution policy", () => {
    expect(
      isStandaloneAnswerResolved({
        current: {
          revealed: false,
          result: { ok: true },
          attempts: 1,
        },
        maxAttempts: 3,
      }),
    ).toBe(true);

    expect(
      isStandaloneAnswerResolved({
        current: {
          revealed: false,
          result: { ok: false },
          attempts: 3,
        },
        maxAttempts: 3,
        allowReveal: true,
      }),
    ).toBe(false);

    expect(
      isStandaloneAnswerResolved({
        current: {
          revealed: false,
          result: { ok: false },
          attempts: 3,
        },
        maxAttempts: 3,
        allowReveal: false,
      }),
    ).toBe(true);
  });

  it("preserves runtime descriptor normalization helpers", () => {
    expect(asJsonRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asJsonRecord([])).toBeNull();
    expect(runtimeString("  python  ")).toBe("python");
    expect(runtimeString(12)).toBe("");
    expect(studentRuntimeDifficulty("hard")).toBe("hard");
    expect(studentRuntimeDifficulty("unknown")).toBe("easy");
  });
});
