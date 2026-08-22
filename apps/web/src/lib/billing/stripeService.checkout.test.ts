
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "4c37ca16-f26d-4f90-8b12-76b1f387f670";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  subscriptionUpsert: vi.fn(),
  customerRetrieve: vi.fn(),
  customerCreate: vi.fn(),
  checkoutList: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutExpire: vi.fn(),
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
      upsert: mocks.subscriptionUpsert,
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    customers: {
      retrieve: mocks.customerRetrieve,
      create: mocks.customerCreate,
    },
    checkout: {
      sessions: {
        list: mocks.checkoutList,
        create: mocks.checkoutCreate,
        retrieve: mocks.checkoutRetrieve,
        expire: mocks.checkoutExpire,
      },
    },
  }),
}));

import {
  classifyCheckoutSessionIntent,
  createCheckoutSession,
  expireOpenCheckoutSession,
  findExistingCheckoutSessionForAttempt,
  upsertFromStripeSubscription,
} from "./stripeService";

describe("createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_MONTHLY_ID = "price_monthly";
    process.env.STRIPE_PRICE_YEARLY_ID = "price_yearly";
    process.env.TRIAL_DAYS = "7";
    process.env.AUTH_URL = "https://zoeskoul.test";

    mocks.userFindUnique.mockResolvedValue({
      email: "student@example.test",
      stripeCustomerId: "cus_1",
    });
    mocks.customerRetrieve.mockResolvedValue({
      id: "cus_1",
      deleted: false,
    });
    mocks.checkoutList.mockResolvedValue({ data: [] });
    mocks.subscriptionUpsert.mockResolvedValue({});
    mocks.releaseBillingCheckoutReservation.mockResolvedValue(true);
    mocks.checkoutCreate.mockResolvedValue({
      id: "cs_test_abc123",
      url: "https://checkout.stripe.test/cs_test_abc123",
    });
  });

  it("uses the per-attempt UUID as Stripe POST idempotency and metadata", async () => {
    const expiresAt = new Date("2026-08-07T04:30:00.000Z");

    await createCheckoutSession({
      userId: "user_1",
      priceId: "price_monthly",
      useTrial: true,
      callbackUrl: "/en/subjects/sql",
      currency: "usd",
      appLocale: "en",
      checkoutAttemptId: ATTEMPT_ID,
      checkoutExpiresAt: expiresAt,
    });

    expect(mocks.checkoutCreate).toHaveBeenCalledTimes(1);
    const [params, requestOptions] = mocks.checkoutCreate.mock.calls[0];

    expect(requestOptions).toEqual({
      idempotencyKey: `zoeskoul-checkout:${ATTEMPT_ID}`,
    });
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: "user_1",
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      metadata: {
        userId: "user_1",
        checkoutAttemptId: ATTEMPT_ID,
        useTrial: "true",
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          userId: "user_1",
          priceId: "price_monthly",
          currency: "usd",
          checkoutAttemptId: ATTEMPT_ID,
        },
      },
    });

    expect(params.success_url).toContain(
      `checkout_attempt_id=${ATTEMPT_ID}`,
    );
    expect(params.cancel_url).toContain(
      `checkout_attempt_id=${ATTEMPT_ID}`,
    );
    expect(params.cancel_url).toContain("canceled=1");
  });

  it("applies one server-selected campaign coupon without sending manual-promotion parameters", async () => {
    await createCheckoutSession({ userId: "user_1", priceId: "price_monthly", useTrial: false, callbackUrl: "/en/billing", currency: "usd", appLocale: "en", checkoutAttemptId: ATTEMPT_ID, promotion: { id: "campaign_1", stripeCouponId: "coupon_20", percentOff: 20 } });
    const [params] = mocks.checkoutCreate.mock.calls[0];
    expect(params).toMatchObject({ discounts: [{ coupon: "coupon_20" }], metadata: { promotionCampaignId: "campaign_1", promotionPercentOff: "20" }, subscription_data: { metadata: { promotionCampaignId: "campaign_1", promotionPercentOff: "20" } } });
    expect(params.allow_promotion_codes).toBeUndefined();
  });

  it("preserves manual promotion codes without an automatic campaign", async () => {
    await createCheckoutSession({ userId: "user_1", priceId: "price_monthly", useTrial: false, callbackUrl: "/en/billing", currency: "usd", appLocale: "en", checkoutAttemptId: ATTEMPT_ID, promotion: null });
    const [params] = mocks.checkoutCreate.mock.calls[0];
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.discounts).toBeUndefined();
  });

  it("releases the matching durable Checkout reservation when a subscription is reconciled", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user_1",
      trialUsedAt: null,
      stripeCustomerId: "cus_1",
    });

    const saved = await upsertFromStripeSubscription(
      {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        current_period_end: 1_800_000_000,
        cancel_at_period_end: false,
        trial_end: null,
        metadata: {
          userId: "user_1",
          checkoutAttemptId: ATTEMPT_ID,
        },
        items: {
          data: [
            {
              price: { id: "price_monthly" },
            },
          ],
        },
      } as unknown as Stripe.Subscription,
      "user_1",
    );

    expect(saved).toMatchObject({
      userId: "user_1",
      status: "active",
      subscriptionId: "sub_1",
    });
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith(
      "user_1",
      ATTEMPT_ID,
    );
  });

  it("finds an existing Checkout Session for one exact reserved attempt without creating a customer", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_test_other",
          mode: "subscription",
          status: "open",
          metadata: { checkoutAttemptId: "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971" },
        },
        {
          id: "cs_test_existing",
          mode: "subscription",
          status: "open",
          metadata: { checkoutAttemptId: ATTEMPT_ID },
        },
      ],
    });

    const found = await findExistingCheckoutSessionForAttempt({
      userId: "user_1",
      checkoutAttemptId: ATTEMPT_ID,
    });

    expect(found).toMatchObject({ id: "cs_test_existing" });
    expect(mocks.checkoutList).toHaveBeenCalledWith({
      customer: "cus_1",
      limit: 100,
      expand: ["data.line_items"],
    });
    expect(mocks.customerCreate).not.toHaveBeenCalled();
  });

  it("recovers a matching existing Session before issuing another Stripe POST", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_test_existing",
          mode: "subscription",
          status: "open",
          metadata: { checkoutAttemptId: ATTEMPT_ID, useTrial: "false" },
          line_items: { data: [{ price: { id: "price_monthly" } }] },
          url: "https://checkout.stripe.test/cs_test_existing",
        },
      ],
    });

    const out = await createCheckoutSession({
      userId: "user_1",
      priceId: "price_monthly",
      useTrial: false,
      callbackUrl: "/en/subjects/sql",
      currency: "usd",
      appLocale: "en",
      checkoutAttemptId: ATTEMPT_ID,
    });

    expect(out).toEqual({
      id: "cs_test_existing",
      url: "https://checkout.stripe.test/cs_test_existing",
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("recovers a completed Session with the local success URL when Stripe has no hosted URL", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_test_complete",
          mode: "subscription",
          status: "complete",
          metadata: { checkoutAttemptId: ATTEMPT_ID, useTrial: "false" },
          line_items: { data: [{ price: { id: "price_monthly" } }] },
          url: null,
        },
      ],
    });

    const out = await createCheckoutSession({
      userId: "user_1",
      priceId: "price_monthly",
      useTrial: false,
      callbackUrl: "/en/subjects/sql",
      currency: "usd",
      appLocale: "en",
      checkoutAttemptId: ATTEMPT_ID,
    });

    expect(out.id).toBe("cs_test_complete");
    expect(out.url).toContain("session_id=cs_test_complete");
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });
});


describe("Checkout plan-switch and expiration primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_MONTHLY_ID = "price_monthly";
    process.env.STRIPE_PRICE_YEARLY_ID = "price_yearly";
    process.env.TRIAL_DAYS = "7";
    process.env.AUTH_URL = "https://zoeskoul.test";
    mocks.userFindUnique.mockResolvedValue({ id: "user_1", email: "learner@example.test", stripeCustomerId: "cus_1", trialUsedAt: null });
    mocks.customerRetrieve.mockResolvedValue({ id: "cus_1", deleted: false });
    mocks.checkoutList.mockResolvedValue({ data: [] });
    mocks.checkoutCreate.mockResolvedValue({ id: "cs_test_created", url: "https://checkout.stripe.test/created", status: "open", mode: "subscription", metadata: {} });
  });

  it("classifies exact plan/trial intent and detects drift", () => {
    const session = { metadata: { priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] } } as unknown as Stripe.Checkout.Session;
    expect(classifyCheckoutSessionIntent({ session, priceId: "price_monthly", useTrial: false })).toBe("match");
    expect(classifyCheckoutSessionIntent({ session, priceId: "price_yearly", useTrial: false })).toBe("mismatch");
    expect(classifyCheckoutSessionIntent({ session, priceId: "price_monthly", useTrial: true })).toBe("mismatch");
  });

  it("uses expanded line items to classify legacy Sessions", () => {
    const session = { metadata: { useTrial: "false" }, line_items: { data: [{ price: { id: "price_yearly" } }] } } as unknown as Stripe.Checkout.Session;
    expect(classifyCheckoutSessionIntent({ session, priceId: "price_yearly", useTrial: false })).toBe("match");
  });

  it("returns unknown rather than guessing incomplete legacy identity", () => {
    const session = { metadata: {}, line_items: { data: [] } } as unknown as Stripe.Checkout.Session;
    expect(classifyCheckoutSessionIntent({ session, priceId: "price_monthly", useTrial: false })).toBe("unknown");
  });

  it("finds an explicitly expired attempt and expands line items", async () => {
    mocks.checkoutList.mockResolvedValue({ data: [{ id: "cs_test_expired", mode: "subscription", status: "expired", metadata: { checkoutAttemptId: ATTEMPT_ID, useTrial: "false" }, line_items: { data: [{ price: { id: "price_monthly" } }] } }] });
    const found = await findExistingCheckoutSessionForAttempt({ userId: "user_1", checkoutAttemptId: ATTEMPT_ID });
    expect(found?.status).toBe("expired");
    expect(mocks.checkoutList).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_1", expand: ["data.line_items"] }));
  });

  it("accepts a concurrent expiration only when Stripe re-read proves expired", async () => {
    mocks.checkoutExpire.mockRejectedValue(new Error("already changed"));
    mocks.checkoutRetrieve.mockResolvedValue({ id: "cs_test_race", status: "expired" });
    await expect(expireOpenCheckoutSession("cs_test_race")).resolves.toMatchObject({ id: "cs_test_race", status: "expired" });
  });

  it("propagates expiration uncertainty when Stripe still reports open", async () => {
    mocks.checkoutExpire.mockRejectedValue(new Error("network down"));
    mocks.checkoutRetrieve.mockResolvedValue({ id: "cs_test_open", status: "open" });
    await expect(expireOpenCheckoutSession("cs_test_open")).rejects.toThrow("network down");
  });

  it("stores priceId in Checkout metadata", async () => {
    await createCheckoutSession({ userId: "user_1", priceId: "price_yearly", useTrial: false, callbackUrl: "/en/billing", currency: "usd", appLocale: "en", checkoutAttemptId: ATTEMPT_ID });
    const [params] = mocks.checkoutCreate.mock.calls[0];
    expect(params.metadata).toMatchObject({ checkoutAttemptId: ATTEMPT_ID, priceId: "price_yearly", useTrial: "false" });
  });

  it("refuses same-attempt recovery when Stripe intent drifted", async () => {
    mocks.checkoutList.mockResolvedValue({ data: [{ id: "cs_test_wrong", mode: "subscription", status: "open", url: "https://checkout.stripe.test/wrong", metadata: { checkoutAttemptId: ATTEMPT_ID, priceId: "price_yearly", useTrial: "false" }, line_items: { data: [] } }] });
    await expect(createCheckoutSession({ userId: "user_1", priceId: "price_monthly", useTrial: false, callbackUrl: "/en/billing", currency: "usd", appLocale: "en", checkoutAttemptId: ATTEMPT_ID })).rejects.toThrow("Existing Stripe Checkout intent does not match this attempt.");
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });
});
