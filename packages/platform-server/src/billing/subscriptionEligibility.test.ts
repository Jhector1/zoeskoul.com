import { describe, expect, it } from "vitest";
import { hasCurrentSubscriptionAccess } from "./subscriptionEligibility";
const now = Date.parse("2026-10-20T12:00:00.000Z");
const future = new Date(now + 60_000);
const past = new Date(now - 60_000);
describe("shared platform billing eligibility", () => {
  it("honors Stripe terminal cancellation and scheduled paid-through access", () => {
    for (const status of ["active", "past_due"]) {
      expect(hasCurrentSubscriptionAccess({status, currentPeriodEnd:future,nowMs:now})).toBe(true);
      expect(hasCurrentSubscriptionAccess({status, currentPeriodEnd:past,nowMs:now})).toBe(false);
    }
    expect(hasCurrentSubscriptionAccess({status:"canceled",currentPeriodEnd:future,nowMs:now})).toBe(false);
    expect(hasCurrentSubscriptionAccess({status:"active",currentPeriodEnd:future,nowMs:now})).toBe(true); // scheduled cancellation
    expect(hasCurrentSubscriptionAccess({status:"trialing",trialEnd:future,nowMs:now})).toBe(true);
  });
  it("fails closed for unpaid, incomplete or invalid periods", () => {
    for (const status of ["unpaid", "incomplete", "paused", "incomplete_expired"]) {
      expect(hasCurrentSubscriptionAccess({status,currentPeriodEnd:future,nowMs:now})).toBe(false);
    }
    expect(hasCurrentSubscriptionAccess({status:"active",currentPeriodEnd:"invalid",nowMs:now})).toBe(false);
  });
});
