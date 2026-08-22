import { describe, expect, it } from "vitest";
import { billingPromotionIsActive, billingPromotionWindowsOverlap, discountedMinorUnits, promotionAppliesToPlan } from "./promotion";

const NOW = new Date("2026-08-22T15:00:00.000Z");

describe("billing promotion contract", () => {
  it("matches plan scopes", () => {
    expect(promotionAppliesToPlan("monthly", "monthly")).toBe(true);
    expect(promotionAppliesToPlan("monthly", "yearly")).toBe(false);
    expect(promotionAppliesToPlan("both", "yearly")).toBe(true);
  });

  it("requires enabled and a live time window", () => {
    expect(billingPromotionIsActive({ enabled: true, planScope: "both", startsAt: "2026-08-22T14:00:00.000Z", endsAt: "2026-08-22T16:00:00.000Z" }, NOW)).toBe(true);
    expect(billingPromotionIsActive({ enabled: false, planScope: "both", startsAt: "2026-08-22T14:00:00.000Z", endsAt: "2026-08-22T16:00:00.000Z" }, NOW)).toBe(false);
    expect(billingPromotionIsActive({ enabled: true, planScope: "both", startsAt: "2026-08-22T16:00:00.000Z", endsAt: "2026-08-22T17:00:00.000Z" }, NOW)).toBe(false);
    expect(billingPromotionIsActive({ enabled: true, planScope: "both", startsAt: "2026-08-22T13:00:00.000Z", endsAt: "2026-08-22T15:00:00.000Z" }, NOW)).toBe(false);
  });

  it("rejects overlapping windows only for a shared plan", () => {
    const left = { planScope: "monthly" as const, startsAt: "2026-08-22T14:00:00.000Z", endsAt: "2026-08-22T18:00:00.000Z" };
    expect(billingPromotionWindowsOverlap(left, { planScope: "yearly", startsAt: "2026-08-22T15:00:00.000Z", endsAt: "2026-08-22T16:00:00.000Z" })).toBe(false);
    expect(billingPromotionWindowsOverlap(left, { planScope: "both", startsAt: "2026-08-22T15:00:00.000Z", endsAt: "2026-08-22T16:00:00.000Z" })).toBe(true);
  });

  it("calculates the discounted minor-unit preview", () => {
    expect(discountedMinorUnits(1000, 20)).toBe(800);
    expect(discountedMinorUnits(12000, 25)).toBe(9000);
    expect(discountedMinorUnits(1000, 100)).toBe(0);
  });
});
