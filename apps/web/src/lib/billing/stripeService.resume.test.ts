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
  reconcileBuilderAiBilling: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// The resume test owns subscription state transitions. Builder grant projection
// has its own tests and must not require an unrelated grant DB fixture here.
vi.mock("@/lib/billing/reconcileBuilderAiBillingForUser", () => ({
  reconcileBuilderAiBillingForUser: mocks.reconcileBuilderAiBilling,
}));
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
    mocks.reconcileBuilderAiBilling.mockResolvedValue([]);
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
    expect(mocks.reconcileBuilderAiBilling).toHaveBeenCalledExactlyOnceWith("user_1");
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
    expect(mocks.reconcileBuilderAiBilling).not.toHaveBeenCalled();
  });

  it("never calls Stripe when the local subscription has lost customer ownership", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({
      stripeCustomerId: "cus_old",
      status: "active",
      cancelAtPeriodEnd: true,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user_1", stripeCustomerId: "cus_new",
    });

    await expect(resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    })).resolves.toBeNull();

    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("refuses to modify Stripe when the user has no canonical customer binding", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user_1", stripeCustomerId: null });

    await expect(resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    })).resolves.toBeNull();

    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("refuses to modify Stripe when a local row has no customer binding", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({
      stripeCustomerId: null, status: "active", cancelAtPeriodEnd: true,
    });

    await expect(resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    })).resolves.toBeNull();

    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("refuses a Stripe subscription with another user's ownership metadata", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(
      subscription({ metadata: { userId: "user_foreign" } }),
    );

    await expect(resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    })).rejects.toThrow("Subscription ownership mismatch");

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
  });

  it("reconciles Stripe's ended subscription instead of resuming stale local state", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(subscription({ status: "canceled" }));

    await expect(resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    })).resolves.toBeNull();

    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileBuilderAiBilling).toHaveBeenCalledWith("user_1");
  });

  it("does not issue an unnecessary resume update once Stripe has already resumed", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(subscription({
      status: "active", cancel_at_period_end: false,
    }));

    const result = await resumeScheduledSubscriptionForUser({
      userId: "user_1", subscriptionId: "sub_1",
    });
    expect(result).toMatchObject({status:"active",cancelAtPeriodEnd:false});
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpsert).toHaveBeenCalledTimes(1);
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
