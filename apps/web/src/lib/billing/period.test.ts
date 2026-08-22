import {
  describe,
  expect,
  it,
} from "vitest";

import {
  canResumeScheduledSubscription,
  futureBillingPeriodIsoOrNull,
  hasCurrentSubscriptionAccess,
  scheduledCancellationEndIso,
  shouldShowRenewalDate,
} from "./period";

const NOW = Date.parse("2026-08-07T08:00:00.000Z");

describe("billing period presentation", () => {
  it("normalizes missing, invalid, epoch, and expired periods to null", () => {
    expect(
      futureBillingPeriodIsoOrNull(null, NOW),
    ).toBeNull();

    expect(
      futureBillingPeriodIsoOrNull("not-a-date", NOW),
    ).toBeNull();

    expect(
      futureBillingPeriodIsoOrNull(
        "1970-01-01T00:00:00.000Z",
        NOW,
      ),
    ).toBeNull();

    expect(
      futureBillingPeriodIsoOrNull(
        "2026-08-06T08:00:00.000Z",
        NOW,
      ),
    ).toBeNull();
  });

  it("keeps a real future billing period", () => {
    expect(
      futureBillingPeriodIsoOrNull(
        "2026-09-07T08:00:00.000Z",
        NOW,
      ),
    ).toBe("2026-09-07T08:00:00.000Z");
  });

  it("shows Renews only for active auto-renewing subscriptions", () => {
    const future = "2026-09-07T08:00:00.000Z";

    expect(
      shouldShowRenewalDate({
        status: "active",
        currentPeriodEnd: future,
        cancelAtPeriodEnd: false,
        nowMs: NOW,
      }),
    ).toBe(true);

    expect(
      shouldShowRenewalDate({
        status: "canceled",
        currentPeriodEnd: future,
        cancelAtPeriodEnd: false,
        nowMs: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowRenewalDate({
        status: "active",
        currentPeriodEnd: future,
        cancelAtPeriodEnd: true,
        nowMs: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowRenewalDate({
        status: "active",
        currentPeriodEnd:
          "1970-01-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("uses trial_end, not a later billing period, while trialing", () => {
    const pastTrial = "2026-08-06T08:00:00.000Z";
    const laterPeriod = "2026-09-07T08:00:00.000Z";

    expect(
      hasCurrentSubscriptionAccess({
        status: "trialing",
        trialEnd: pastTrial,
        currentPeriodEnd: laterPeriod,
        nowMs: NOW,
      }),
    ).toBe(false);

    expect(
      hasCurrentSubscriptionAccess({
        status: "trialing",
        trialEnd: "2026-08-08T08:00:00.000Z",
        currentPeriodEnd: laterPeriod,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("uses the correct effective end for scheduled cancellation", () => {
    expect(
      scheduledCancellationEndIso({
        status: "trialing",
        trialEnd: "2026-08-08T08:00:00.000Z",
        currentPeriodEnd: "2026-09-07T08:00:00.000Z",
        cancelAtPeriodEnd: true,
        nowMs: NOW,
      }),
    ).toBe("2026-08-08T08:00:00.000Z");

    expect(
      scheduledCancellationEndIso({
        status: "active",
        trialEnd: null,
        currentPeriodEnd: "2026-09-07T08:00:00.000Z",
        cancelAtPeriodEnd: true,
        nowMs: NOW,
      }),
    ).toBe("2026-09-07T08:00:00.000Z");

    expect(
      canResumeScheduledSubscription({
        status: "trialing",
        trialEnd: "2026-08-08T08:00:00.000Z",
        currentPeriodEnd: "2026-09-07T08:00:00.000Z",
        cancelAtPeriodEnd: true,
        nowMs: NOW,
      }),
    ).toBe(true);

    expect(
      canResumeScheduledSubscription({
        status: "trialing",
        trialEnd: "2026-08-06T08:00:00.000Z",
        currentPeriodEnd: "2026-09-07T08:00:00.000Z",
        cancelAtPeriodEnd: true,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

});
