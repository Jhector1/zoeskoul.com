import { describe, expect, it } from "vitest";
import type { BillingStatus } from "@/lib/billing/types";
import { deriveBillingHeadline } from "./deriveBillingHeadline";

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    isAuthenticated: true,
    isSubscribed: false,
    billingExempt: false,
    stripeStatus: null,
    subscriptionId: null,
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    currency: "usd",
    monthlyUnitAmountMinor: 1000,
    yearlyUnitAmountMinor: 10000,
    monthlyPriceLabel: "$10 / mo",
    yearlyPriceLabel: "$100 / yr",
    trialDays: 7,
    trialEligible: false,
    trialEndsAt: null,
    currentPlan: null,
    ...overrides,
  };
}

describe("deriveBillingHeadline", () => {

  it("shows included access instead of a payment call to action for privileged accounts", () => {
    expect(
      deriveBillingHeadline(
        status({ billingExempt: true, isSubscribed: true }),
        "en-US",
      ),
    ).toEqual({ tone: "good", text: "Access included" });
  });
  it("offers the free trial when the learner has not used it", () => {
    expect(deriveBillingHeadline(status({ trialEligible: true }), "en-US")).toMatchObject({
      text: "Start free trial",
      href: "/billing",
    });
  });

  it("shows active only when entitlement is actually active", () => {
    expect(
      deriveBillingHeadline(
        status({ stripeStatus: "active", isSubscribed: true }),
        "en-US",
      )?.text,
    ).toBe("Active subscription");

    expect(
      deriveBillingHeadline(
        status({ stripeStatus: "active", isSubscribed: false }),
        "en-US",
      )?.text,
    ).toBe("Renew subscription");
  });

  it("shows payment failure even while access remains in a grace period", () => {
    expect(
      deriveBillingHeadline(
        status({ stripeStatus: "past_due", isSubscribed: true }),
        "en-US",
      ),
    ).toMatchObject({ tone: "danger", text: "Payment failed" });
  });

  it("shows remaining access for a canceled subscription", () => {
    expect(
      deriveBillingHeadline(
        status({
          stripeStatus: "canceled",
          isSubscribed: true,
          currentPeriodEnd: "2030-01-02T00:00:00.000Z",
        }),
        "en-US",
      )?.text,
    ).toContain("Access until");
  });

  it("does not show a billing control to signed-out visitors", () => {
    expect(
      deriveBillingHeadline(status({ isAuthenticated: false }), "en-US"),
    ).toBeNull();
  });
});
