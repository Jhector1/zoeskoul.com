import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionUpdate: vi.fn(),
  releaseBillingCheckoutReservation: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/billingCheckoutReservation", () => ({
  releaseBillingCheckoutReservation:
    mocks.releaseBillingCheckoutReservation,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    subscription: {
      findFirst: mocks.subscriptionFindFirst,
      upsert: mocks.subscriptionUpsert,
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: mocks.subscriptionRetrieve,
      update: mocks.subscriptionUpdate,
    },
  }),
}));

import { resumeScheduledSubscriptionForUser } from "./stripeService";

function subscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: true,
    trial_end: 4_102_444_800,
    current_period_end: 4_105_123_200,
    metadata: { userId: "user_1" },
    items: {
      data: [
        {
          current_period_end: 4_105_123_200,
          price: { id: "price_monthly" },
        } as Stripe.SubscriptionItem,
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
    ...overrides,
  } as Stripe.Subscription;
}

describe("resumeScheduledSubscriptionForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.subscriptionFindFirst.mockResolvedValue({
      stripeCustomerId: "cus_1",
      status: "trialing",
      cancelAtPeriodEnd: true,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user_1",
      trialUsedAt: new Date("2026-08-20T00:00:00.000Z"),
      stripeCustomerId: "cus_1",
    });
    mocks.subscriptionUpsert.mockResolvedValue({});
    mocks.releaseBillingCheckoutReservation.mockResolvedValue(true);
  });

  it("clears a pending cancellation on the existing Stripe subscription", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(subscription());
    mocks.subscriptionUpdate.mockResolvedValue(
      subscription({ cancel_at_period_end: false }),
    );

    const out = await resumeScheduledSubscriptionForUser({
      userId: "user_1",
      subscriptionId: "sub_1",
    });

    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(
      "sub_1",
      { cancel_at_period_end: false },
    );
    expect(mocks.subscriptionUpsert).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({
      subscriptionId: "sub_1",
      status: "trialing",
      cancelAtPeriodEnd: false,
    });
  });

  it("does not resume a local subscription that is already ended", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({
      stripeCustomerId: "cus_1",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });

    await expect(
      resumeScheduledSubscriptionForUser({
        userId: "user_1",
        subscriptionId: "sub_1",
      }),
    ).resolves.toBeNull();

    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("refuses a Stripe customer mismatch", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(
      subscription({ customer: "cus_other" }),
    );

    await expect(
      resumeScheduledSubscriptionForUser({
        userId: "user_1",
        subscriptionId: "sub_1",
      }),
    ).rejects.toThrow("Subscription customer mismatch");

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });
});
