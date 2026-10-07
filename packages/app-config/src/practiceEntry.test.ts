import { describe, expect, it } from "vitest";

import {
  buildPracticeEntryHref,
  hasPracticeEntryIntent,
  removePracticeEntryIntent,
} from "./index";

describe("practice entry policy", () => {
  it("preserves authenticated and guest entry behavior", () => {
    expect(buildPracticeEntryHref(true)).toContain("/practice");

    const guestHref = buildPracticeEntryHref(false);
    expect(guestHref).toContain("practice=start");

    expect(hasPracticeEntryIntent("?practice=start")).toBe(true);
    expect(hasPracticeEntryIntent("?practice=other")).toBe(false);
  });

  it("removes only the practice-entry query intent", () => {
    expect(
      removePracticeEntryIntent(
        "/en?practice=start&source=home#practice",
      ),
    ).toBe("/en?source=home#practice");
  });
});
