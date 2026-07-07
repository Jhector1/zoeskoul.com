import { describe, expect, it } from "vitest";

import { resolvePracticeQueueStatus } from "./queueStatus";

function item(overrides: Record<string, unknown> = {}) {
  return {
    key: "exercise-1",
    exercise: {},
    result: null,
    submitted: false,
    revealed: false,
    attempts: 0,
    ...overrides,
  } as any;
}

describe("resolvePracticeQueueStatus", () => {
  it("keeps an incorrect unlimited-attempt check in progress", () => {
    expect(
      resolvePracticeQueueStatus(
        item({
          attempts: 3,
          result: {
            ok: false,
            finalized: false,
            attempts: { used: 3, max: null, left: null },
          },
        }),
      ),
    ).toBe("in_progress");
  });

  it("marks only a finalized incorrect answer completed", () => {
    expect(
      resolvePracticeQueueStatus(
        item({ result: { ok: false, finalized: true } }),
      ),
    ).toBe("completed");
  });

  it("keeps correct and revealed outcomes distinct", () => {
    expect(
      resolvePracticeQueueStatus(
        item({ result: { ok: true, finalized: true } }),
      ),
    ).toBe("correct");
    expect(resolvePracticeQueueStatus(item({ revealed: true }))).toBe(
      "revealed",
    );
  });
});
