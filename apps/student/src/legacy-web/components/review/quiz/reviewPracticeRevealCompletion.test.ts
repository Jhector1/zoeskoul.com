import { describe, expect, it } from "vitest";

import type { QItem } from "@/lib/practice/uiTypes";
import { buildReviewPracticeRevealCompletionPatch } from "./reviewPracticeRevealCompletion";

function item(patch: Partial<QItem> = {}): QItem {
  return {
    key: "practice-key",
    exercise: null,
    single: null,
    multi: [],
    num: "",
    dragA: { x: 0, y: 0, z: 0 },
    dragB: { x: 0, y: 0, z: 0 },
    matRows: 0,
    matCols: 0,
    mat: [],
    result: null,
    submitted: false,
    code: "",
    codeLang: "python",
    codeStdin: "",
    text: "",
    voiceTranscript: "",
    help: {
      openedStepKeys: [],
      activeStepKey: null,
      busyStepKey: null,
      error: null,
      entries: {},
    },
    revealed: false,
    ...patch,
  } as QItem;
}

describe("buildReviewPracticeRevealCompletionPatch", () => {
  it("turns a finalized reveal into a durable terminal item state", () => {
    const patch = buildReviewPracticeRevealCompletionPatch({
      current: item(),
      response: {
        reveal: { kind: "single_choice", optionId: "correct" },
        finalized: true,
        sessionComplete: false,
        summary: { answered: 1 },
      },
    });

    expect(patch).toMatchObject({
      submitted: true,
      revealed: true,
      feedbackDismissed: true,
      result: {
        ok: false,
        finalized: true,
        revealUsed: true,
        revealAnswer: { kind: "single_choice", optionId: "correct" },
        sessionComplete: false,
        summary: { answered: 1 },
      },
    });
  });

  it("preserves an already-correct result defensively", () => {
    const patch = buildReviewPracticeRevealCompletionPatch({
      current: item({ result: { ok: true } as any }),
      response: {
        reveal: { kind: "numeric", value: 4 },
        finalized: true,
      },
    });

    expect((patch?.result as any)?.ok).toBe(true);
  });

  it("does nothing for hints and non-final reveal responses", () => {
    expect(
      buildReviewPracticeRevealCompletionPatch({
        current: item(),
        response: { finalized: false, reveal: { kind: "numeric", value: 4 } },
      }),
    ).toBeNull();

    expect(
      buildReviewPracticeRevealCompletionPatch({
        current: item(),
        response: { finalized: true, reveal: null },
      }),
    ).toBeNull();
  });
});
