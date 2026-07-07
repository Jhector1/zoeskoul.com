import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canRevealExpectedForStatusOnly } from "./getStatus";

describe("practice status expected-answer policy", () => {
  it("does not leak expected answers for review-module assignments", () => {
    expect(
      canRevealExpectedForStatusOnly(
        {
          id: "session-1",
          mode: "standard",
          assignmentId: null,
          meta: { kind: "module_assignment", moduleSlug: "python-1" },
        },
        false,
      ),
    ).toBe(false);
  });

  it("follows the authored reveal policy for teacher assignments", () => {
    const session = {
      id: "session-2",
      mode: "assignment",
      assignmentId: "assignment-1",
      meta: null,
    };

    expect(canRevealExpectedForStatusOnly(session, false)).toBe(false);
    expect(canRevealExpectedForStatusOnly(session, true)).toBe(true);
  });

  it("preserves completion review for non-assignment practice", () => {
    expect(
      canRevealExpectedForStatusOnly(
        { id: "session-3", mode: "daily_five", assignmentId: null, meta: { kind: "daily_five" } },
        true,
      ),
    ).toBe(true);
  });
});
