import { describe, expect, it } from "vitest";

import {
  DEFAULT_STANDARD_PRACTICE_TARGET_COUNT,
  resolveAvailablePracticeTargetCount,
} from "./availableTargetCount";

describe("resolveAvailablePracticeTargetCount", () => {
  it("keeps the requested size when the scope has enough exercises", () => {
    expect(
      resolveAvailablePracticeTargetCount({ requested: 10, available: 24 }),
    ).toBe(10);
  });

  it("uses every remaining exercise when fewer are available", () => {
    expect(
      resolveAvailablePracticeTargetCount({ requested: 10, available: 4 }),
    ).toBe(4);
    expect(
      resolveAvailablePracticeTargetCount({ requested: 3, available: 2 }),
    ).toBe(2);
  });

  it("returns zero only for an empty scope", () => {
    expect(
      resolveAvailablePracticeTargetCount({
        requested: DEFAULT_STANDARD_PRACTICE_TARGET_COUNT,
        available: 0,
      }),
    ).toBe(0);
  });
});
