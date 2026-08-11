import { describe, expect, it } from "vitest";

import { normalizeDraftQaExpectedForGrading } from "./practiceQaPure";

describe("normalizeDraftQaExpectedForGrading", () => {
  it("maps authored drag-reorder tokenIds to the runtime grader order field", () => {
    expect(
      normalizeDraftQaExpectedForGrading("drag_reorder", {
        kind: "drag_reorder",
        tokenIds: ["t1", "t2", "t3"],
      }),
    ).toEqual({
      kind: "drag_reorder",
      tokenIds: ["t1", "t2", "t3"],
      order: ["t1", "t2", "t3"],
    });
  });

  it("preserves an already canonical drag-reorder order", () => {
    expect(
      normalizeDraftQaExpectedForGrading("drag_reorder", {
        kind: "drag_reorder",
        order: ["t3", "t1", "t2"],
      }),
    ).toEqual({
      kind: "drag_reorder",
      order: ["t3", "t1", "t2"],
    });
  });

  it("does not alter non-drag expected contracts", () => {
    const expected = {
      kind: "single_choice",
      optionId: "a",
    };

    expect(
      normalizeDraftQaExpectedForGrading("single_choice", expected),
    ).toBe(expected);
  });
});
