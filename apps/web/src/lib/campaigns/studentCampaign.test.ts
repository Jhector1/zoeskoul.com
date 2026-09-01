import { describe, expect, it } from "vitest";

import {
  studentCampaignAudienceMatches,
  studentCampaignShouldDisplay,
} from "./studentCampaign";

describe("student campaign policy", () => {
  it("matches all/free/plus audiences", () => {
    expect(studentCampaignAudienceMatches("all", false)).toBe(true);
    expect(studentCampaignAudienceMatches("all", true)).toBe(true);
    expect(studentCampaignAudienceMatches("free", false)).toBe(true);
    expect(studentCampaignAudienceMatches("free", true)).toBe(false);
    expect(studentCampaignAudienceMatches("plus", false)).toBe(false);
    expect(studentCampaignAudienceMatches("plus", true)).toBe(true);
  });

  it("supports once, daily, always, and permanent hide", () => {
    const now = new Date("2026-08-31T18:00:00.000Z");

    expect(
      studentCampaignShouldDisplay(
        "once",
        null,
        null,
        now,
      ),
    ).toBe(true);

    expect(
      studentCampaignShouldDisplay(
        "once",
        new Date("2026-08-30T18:00:00.000Z"),
        null,
        now,
      ),
    ).toBe(false);

    expect(
      studentCampaignShouldDisplay(
        "daily",
        new Date("2026-08-30T23:59:59.000Z"),
        null,
        now,
      ),
    ).toBe(true);

    expect(
      studentCampaignShouldDisplay(
        "daily",
        new Date("2026-08-31T01:00:00.000Z"),
        null,
        now,
      ),
    ).toBe(false);

    expect(
      studentCampaignShouldDisplay(
        "always",
        new Date("2026-08-31T17:59:00.000Z"),
        null,
        now,
      ),
    ).toBe(true);

    expect(
      studentCampaignShouldDisplay(
        "always",
        null,
        new Date("2026-08-31T17:00:00.000Z"),
        now,
      ),
    ).toBe(false);
  });
});
