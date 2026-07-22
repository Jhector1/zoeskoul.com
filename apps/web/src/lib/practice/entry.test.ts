import { describe, expect, it } from "vitest";

import {
  buildPracticeEntryHref,
  hasPracticeEntryIntent,
  removePracticeEntryIntent,
} from "./entry";

describe("practice entry routing", () => {
  it("sends authenticated learners directly to daily practice", () => {
    expect(buildPracticeEntryHref(true)).toBe("/practice/daily");
  });

  it("sends guests through the home practice intent", () => {
    expect(buildPracticeEntryHref(false)).toBe("/?practice=start");
  });

  it("recognizes and removes only the practice intent query", () => {
    expect(hasPracticeEntryIntent("?practice=start&from=header")).toBe(true);
    expect(hasPracticeEntryIntent("?practice=other")).toBe(false);
    expect(
      removePracticeEntryIntent(
        "https://zoeskoul.local/en?practice=start&from=header#practice",
      ),
    ).toBe("/en?from=header#practice");
  });
});
