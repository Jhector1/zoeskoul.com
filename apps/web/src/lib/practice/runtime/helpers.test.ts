import { describe, expect, it } from "vitest";

import type { QItem } from "@/lib/practice/uiTypes";
import { isPracticeItemFinalized } from "./helpers";

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
