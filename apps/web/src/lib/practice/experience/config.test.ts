import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEFAULT_DAILY_PRACTICE_TARGET_COUNT,
  MAX_DAILY_PRACTICE_TARGET_COUNT,
  MIN_DAILY_PRACTICE_TARGET_COUNT,
  normalizeDailyPracticeTargetCount,
} from "./config";

describe("daily practice environment config", () => {
  it("defaults to three exercises", () => {
    expect(DEFAULT_DAILY_PRACTICE_TARGET_COUNT).toBe(3);
    expect(normalizeDailyPracticeTargetCount(undefined)).toBe(3);
    expect(normalizeDailyPracticeTargetCount("not-a-number")).toBe(3);
  });

  it("accepts whole numeric strings and clamps unsafe values", () => {
    expect(normalizeDailyPracticeTargetCount("7")).toBe(7);
    expect(normalizeDailyPracticeTargetCount("4.9")).toBe(4);
    expect(normalizeDailyPracticeTargetCount("0")).toBe(
      MIN_DAILY_PRACTICE_TARGET_COUNT,
    );
    expect(normalizeDailyPracticeTargetCount("999")).toBe(
      MAX_DAILY_PRACTICE_TARGET_COUNT,
    );
  });
});
