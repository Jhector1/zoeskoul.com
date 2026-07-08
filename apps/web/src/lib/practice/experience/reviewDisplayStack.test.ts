import { describe, expect, it } from "vitest";

import {
  resolvePracticeDisplayStack,
  resolvePracticeQueuePlaceholderStatus,
} from "./reviewDisplayStack";

const item = (key: string) => ({ key, exercise: {} }) as any;

describe("practice completion display stack", () => {
  it("prefers complete server history over a partial local stack", () => {
    const local = [item("one"), item("two")];
    const history = [item("one"), item("two"), item("three")];

    expect(
      resolvePracticeDisplayStack({
        stack: local,
        reviewStack: history,
        answeredCount: 3,
      }),
    ).toBe(history);
  });

  it("does not label an already answered missing slot as not started", () => {
    expect(
      resolvePracticeQueuePlaceholderStatus({ index: 2, answeredCount: 3 }),
    ).toBe("completed");
    expect(
      resolvePracticeQueuePlaceholderStatus({ index: 3, answeredCount: 3 }),
    ).toBe("not_started");
  });
});
