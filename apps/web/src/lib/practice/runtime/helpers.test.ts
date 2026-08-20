import { describe, expect, it } from "vitest";

import type { QItem } from "@/lib/practice/uiTypes";
import { historyRowToQItem, isPracticeItemFinalized } from "./helpers";

function item(patch: Partial<QItem>): QItem {
  return {
    submitted: false,
    revealed: false,
    attempts: 0,
    result: null,
    ...patch,
  } as QItem;
}

describe("isPracticeItemFinalized", () => {
  it("treats an explicitly revealed item as finalized", () => {
    expect(
      isPracticeItemFinalized(item({ revealed: true }), 3, true),
    ).toBe(true);
  });

  it("treats persisted reveal result markers as finalized", () => {
    expect(
      isPracticeItemFinalized(
        item({ result: { ok: false, revealUsed: true } as any }),
        3,
        true,
      ),
    ).toBe(true);
  });

  it("treats a persisted reveal answer payload as finalized", () => {
    expect(
      isPracticeItemFinalized(
        item({ result: { ok: false, revealAnswer: { kind: "code_input" } } as any }),
        3,
        true,
      ),
    ).toBe(true);
  });

  it("does not finalize an untouched item", () => {
    expect(isPracticeItemFinalized(item({}), 3, true)).toBe(false);
  });
});

describe("historyRowToQItem", () => {
  it("rehydrates reveal state and preserves the learner answer", () => {
    const restored = historyRowToQItem({
      instanceId: "instance-1",
      answeredAt: "2026-08-18T12:00:00.000Z",
      topic: "input-and-type-conversion",
      kind: "code_input",
      title: "Build a next-year age message",
      prompt: "Write the program.",
      publicPayload: { starterCode: "# starter" },
      attempts: 3,
      lastOk: false,
      lastRevealUsed: true,
      revealAnswer: {
        kind: "code_input",
        solutionCode: "print('solution')",
      },
      lastAnswerPayload: {
        kind: "code_input",
        code: "print('wrong')",
        language: "python",
      },
    });

    expect(restored.revealed).toBe(true);
    expect(restored.submitted).toBe(true);
    expect(restored.attempts).toBe(3);
    expect((restored.result as any)?.revealUsed).toBe(true);
    expect((restored.result as any)?.revealAnswer?.solutionCode).toBe(
      "print('solution')",
    );
    expect((restored as any).code).toBe("print('wrong')");
  });

  it("keeps an attempted but unanswered instance active", () => {
    const restored = historyRowToQItem({
      instanceId: "instance-2",
      answeredAt: null,
      topic: "variables",
      kind: "text_input",
      attempts: 1,
      lastOk: false,
      lastRevealUsed: false,
      lastAnswerPayload: { kind: "text_input", value: "draft" },
    });

    expect(restored.submitted).toBe(false);
    expect((restored.result as any)?.finalized).toBe(false);
    expect((restored as any).text).toBe("draft");
  });
});
