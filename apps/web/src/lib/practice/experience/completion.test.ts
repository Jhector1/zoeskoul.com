import { describe, expect, it } from "vitest";
import {
  countdownParts,
  nextUtcDayStartIso,
  resolvePracticeCompletionIntent,
} from "./completion";

describe("practice completion intent", () => {
  it("separates free and subscriber daily completion", () => {
    expect(
      resolvePracticeCompletionIntent({
        mode: "daily_five",
        viewer: { tier: "free", authenticated: true, subscribed: false },
      }),
    ).toBe("daily_free");

    expect(
      resolvePracticeCompletionIntent({
        mode: "daily_five",
        viewer: { tier: "subscriber", authenticated: true, subscribed: true },
      }),
    ).toBe("daily_subscriber");
  });

  it("uses the next UTC day because daily sessions are keyed in UTC", () => {
    expect(nextUtcDayStartIso("2026-07-06")).toBe("2026-07-07T00:00:00.000Z");
  });

  it("builds a stable countdown", () => {
    expect(
      countdownParts("2026-07-07T00:00:00.000Z", Date.parse("2026-07-06T22:29:29.000Z")),
    ).toMatchObject({ hours: 1, minutes: 30, seconds: 31, ready: false });
  });
});
