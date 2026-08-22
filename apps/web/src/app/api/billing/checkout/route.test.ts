
import { beforeEach, describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "4c37ca16-f26d-4f90-8b12-76b1f387f670";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  classifyCheckoutSessionIntent: vi.fn(),
  createCheckoutSession: vi.fn(),
  expireOpenCheckoutSession: vi.fn(),
  findExistingCheckoutSessionForAttempt: vi.fn(),
  isDeterministicStripeCheckoutRequestError: vi.fn(),
  syncSubscriptionsForUser: vi.fn(),
  getEntitlementForUser: vi.fn(),
  getLocaleFromCookie: vi.fn(),
  resolveBillingCurrency: vi.fn(),
  getActiveBillingPromotionForPlan: vi.fn(),
  resolveRoleCapabilities: vi.fn(),
  reserveBillingCheckout: vi.fn(),
  releaseBillingCheckoutReservation: vi.fn(),
  enforceSameOriginPost: vi.fn(),
  exceedsContentLength: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));
vi.mock("@/lib/access/roleCapabilities", () => ({
  resolveRoleCapabilities: mocks.resolveRoleCapabilities,
}));
vi.mock("@/lib/billing/stripeService", () => ({
  billingConfig: () => ({
    monthlyPriceId: "price_monthly",
    yearlyPriceId: "price_yearly",
    trialDays: 7,
    appUrl: "https://zoeskoul.test",
  }),
  classifyCheckoutSessionIntent: mocks.classifyCheckoutSessionIntent,
  createCheckoutSession: mocks.createCheckoutSession,
  expireOpenCheckoutSession: mocks.expireOpenCheckoutSession,
  findExistingCheckoutSessionForAttempt:
    mocks.findExistingCheckoutSessionForAttempt,
  isDeterministicStripeCheckoutRequestError:
    mocks.isDeterministicStripeCheckoutRequestError,
  syncSubscriptionsForUser: mocks.syncSubscriptionsForUser,
}));
vi.mock("@/lib/billing/entitlement", () => ({
  getEntitlementForUser: mocks.getEntitlementForUser,
}));
vi.mock("@/lib/billing/currency", () => ({
  resolveBillingCurrency: mocks.resolveBillingCurrency,
}));
vi.mock("@/lib/billing/promotion.server", () => ({
  getActiveBillingPromotionForPlan: mocks.getActiveBillingPromotionForPlan,
}));
vi.mock("@/serverUtils", () => ({
  getLocaleFromCookie: mocks.getLocaleFromCookie,
}));
vi.mock("@/lib/billing/billingCheckoutReservation", () => ({
  BILLING_CHECKOUT_SESSION_LIFETIME_MS: 2 * 60 * 60 * 1000,
  reserveBillingCheckout: mocks.reserveBillingCheckout,
  releaseBillingCheckoutReservation:
    mocks.releaseBillingCheckoutReservation,
}));
vi.mock("@/lib/practice/api/shared/http", () => ({
  enforceSameOriginPost: mocks.enforceSameOriginPost,
  exceedsContentLength: mocks.exceedsContentLength,
  readJsonSafe: (req: Request) => req.json(),
}));

import { POST } from "./route";

function request(
  body: Record<string, unknown> = {
    plan: "monthly",
    useTrial: false,
    callbackUrl: "/en/subjects/sql",
    checkoutAttemptId: ATTEMPT_ID,
  },
) {
  return new Request("https://zoeskoul.test/api/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://zoeskoul.test",
    },
    body: JSON.stringify(body),
  });
}

describe("billing checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceSameOriginPost.mockReturnValue(true);
    mocks.exceedsContentLength.mockReturnValue(false);
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.userFindUnique.mockResolvedValue({
      trialUsedAt: null,
      roles: ["student"],
    });
    mocks.resolveRoleCapabilities.mockReturnValue({
      canBypassBilling: false,
    });
    mocks.reserveBillingCheckout.mockResolvedValue({
      kind: "reserved",
      reservedAt: new Date("2026-08-07T02:30:00.000Z"),
      reused: false,
    });
    mocks.releaseBillingCheckoutReservation.mockResolvedValue(true);
    mocks.syncSubscriptionsForUser.mockResolvedValue(undefined);
    mocks.getEntitlementForUser.mockResolvedValue({
      ok: false,
      reason: "none",
    });
    mocks.getLocaleFromCookie.mockResolvedValue("en");
    mocks.resolveBillingCurrency.mockResolvedValue("usd");
    mocks.getActiveBillingPromotionForPlan.mockResolvedValue(null);
    mocks.classifyCheckoutSessionIntent.mockReturnValue("match");
    mocks.expireOpenCheckoutSession.mockResolvedValue({ id: "cs_test_expired", status: "expired" });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({
      id: "cs_test_existing",
    });
    mocks.isDeterministicStripeCheckoutRequestError.mockReturnValue(false);
    mocks.createCheckoutSession.mockResolvedValue({
      id: "cs_test_1",
      url: "https://checkout.stripe.test/session",
    });
  });

  it("rejects an invalid attempt before reservation or Stripe work", async () => {
    const response = await POST(
      request({
        plan: "monthly",
        useTrial: false,
        callbackUrl: "/",
        checkoutAttemptId: "bad",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.reserveBillingCheckout).not.toHaveBeenCalled();
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("resumes a distinct existing open Stripe Checkout instead of trapping the learner on 409", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValue({
      kind: "conflict",
      reservedAt: new Date(),
      checkoutAttemptId: oldAttemptId,
    });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({
      id: "cs_test_existing",
      status: "open",
      url: "https://checkout.stripe.test/existing",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/existing",
      resumed: true,
    });
    expect(mocks.findExistingCheckoutSessionForAttempt).toHaveBeenCalledWith({
      userId: "user_1",
      checkoutAttemptId: oldAttemptId,
    });
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("keeps a fresh conflicting reservation protected while Stripe has not created a resumable Session yet", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValue({
      kind: "conflict",
      reservedAt: new Date(),
      checkoutAttemptId: oldAttemptId,
    });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHECKOUT_ALREADY_IN_PROGRESS",
    });
    expect(mocks.findExistingCheckoutSessionForAttempt).toHaveBeenCalledWith({
      userId: "user_1",
      checkoutAttemptId: oldAttemptId,
    });
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("replaces an old orphan reservation only after Stripe proves the old attempt has no Checkout Session", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout
      .mockResolvedValueOnce({
        kind: "conflict",
        reservedAt: new Date("2026-08-07T02:29:00.000Z"),
        checkoutAttemptId: oldAttemptId,
      })
      .mockResolvedValueOnce({
        kind: "reserved",
        reservedAt: new Date("2026-08-07T02:35:00.000Z"),
        reused: false,
      });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith(
      "user_1",
      oldAttemptId,
    );
    expect(mocks.reserveBillingCheckout).toHaveBeenCalledTimes(2);
    expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("fails closed and keeps an old reservation when Stripe conflict verification is unavailable", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValue({
      kind: "conflict",
      reservedAt: new Date("2026-08-07T02:29:00.000Z"),
      checkoutAttemptId: oldAttemptId,
    });
    mocks.findExistingCheckoutSessionForAttempt.mockRejectedValue(
      new Error("Stripe unavailable"),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHECKOUT_RECOVERY_UNAVAILABLE",
    });
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("keeps the reservation when current Stripe state cannot be verified", async () => {
    mocks.syncSubscriptionsForUser.mockRejectedValue(
      new Error("Stripe unavailable"),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "BILLING_SYNC_UNAVAILABLE",
    });
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("releases the reservation when entitlement is already active", async () => {
    mocks.getEntitlementForUser.mockResolvedValue({
      ok: true,
      reason: "active",
      status: "active",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "SUBSCRIPTION_ALREADY_ACTIVE",
    });
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith(
      "user_1",
      ATTEMPT_ID,
    );
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("does not silently downgrade a requested free trial into a paid checkout", async () => {
    mocks.userFindUnique.mockResolvedValue({
      trialUsedAt: new Date("2026-08-01T00:00:00.000Z"),
      roles: ["student"],
    });

    const response = await POST(
      request({
        plan: "monthly",
        useTrial: true,
        callbackUrl: "/",
        checkoutAttemptId: ATTEMPT_ID,
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "TRIAL_NOT_AVAILABLE",
    });
    expect(mocks.reserveBillingCheckout).not.toHaveBeenCalled();
    expect(mocks.findExistingCheckoutSessionForAttempt).not.toHaveBeenCalled();
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("passes the stable attempt id and reservation-derived expiry to Stripe creation", async () => {
    const response = await POST(
      request({
        plan: "yearly",
        useTrial: true,
        callbackUrl: "/en/subjects/sql",
        checkoutAttemptId: ATTEMPT_ID,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        priceId: "price_yearly",
        useTrial: true,
        checkoutAttemptId: ATTEMPT_ID,
        checkoutExpiresAt: new Date("2026-08-07T04:30:00.000Z"),
      }),
    );
  });

  it("resolves the active campaign on the server and passes it to Stripe creation", async () => {
    const promotion = { id: "campaign_1", name: "Launch week", percentOff: 20, planScope: "monthly", startsAt: new Date("2026-08-01T00:00:00.000Z"), endsAt: new Date("2026-08-29T00:00:00.000Z"), enabled: true, stripeCouponId: "coupon_20" };
    mocks.getActiveBillingPromotionForPlan.mockResolvedValue(promotion);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.getActiveBillingPromotionForPlan).toHaveBeenCalledWith("monthly");
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ promotion }));
  });

  it("releases the reservation after Stripe deterministically rejects the request", async () => {
    const rejected = Object.assign(new Error("invalid checkout parameters"), {
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
    });
    mocks.createCheckoutSession.mockRejectedValue(rejected);
    mocks.isDeterministicStripeCheckoutRequestError.mockReturnValue(true);

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHECKOUT_REQUEST_REJECTED",
    });
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith(
      "user_1",
      ATTEMPT_ID,
    );
  });

  it("keeps the reservation after an indeterminate Checkout create failure", async () => {
    mocks.createCheckoutSession.mockRejectedValue(
      new Error("connection reset"),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
  });

  it("does not retire an existing paid Checkout for a trial request already known to be ineligible", async () => {
    mocks.userFindUnique.mockResolvedValue({
      trialUsedAt: new Date("2026-08-01T00:00:00.000Z"),
      roles: ["student"],
    });

    const response = await POST(
      request({
        plan: "yearly",
        useTrial: true,
        callbackUrl: "/en/billing",
        checkoutAttemptId: ATTEMPT_ID,
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "TRIAL_NOT_AVAILABLE",
    });
    expect(mocks.reserveBillingCheckout).not.toHaveBeenCalled();
    expect(mocks.findExistingCheckoutSessionForAttempt).not.toHaveBeenCalled();
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
  });

  it("switches an open Monthly Checkout to the newly selected Yearly Checkout", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({
      id: "cs_test_monthly_old", status: "open", url: "https://checkout.stripe.test/monthly-old",
      metadata: { checkoutAttemptId: oldAttemptId, priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] },
    });
    mocks.classifyCheckoutSessionIntent.mockReturnValue("mismatch");
    mocks.expireOpenCheckoutSession.mockResolvedValue({ id: "cs_test_monthly_old", status: "expired" });
    mocks.getActiveBillingPromotionForPlan.mockResolvedValue({ id: "campaign_yearly", stripeCouponId: "coupon_yearly", percentOff: 20 });

    const response = await POST(request({ plan: "yearly", useTrial: false, callbackUrl: "/en/billing", checkoutAttemptId: ATTEMPT_ID }));
    expect(response.status).toBe(200);
    expect(mocks.classifyCheckoutSessionIntent).toHaveBeenCalledWith({ session: expect.objectContaining({ id: "cs_test_monthly_old" }), priceId: "price_yearly", useTrial: false });
    expect(mocks.expireOpenCheckoutSession).toHaveBeenCalledWith("cs_test_monthly_old");
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith("user_1", oldAttemptId);
    expect(mocks.reserveBillingCheckout).toHaveBeenCalledTimes(2);
    expect(mocks.getActiveBillingPromotionForPlan).toHaveBeenCalledWith("yearly");
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ priceId: "price_yearly", useTrial: false, checkoutAttemptId: ATTEMPT_ID, promotion: expect.objectContaining({ id: "campaign_yearly" }) }));
  });

  it("resumes only a live Checkout whose plan and trial intent match", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_match", status: "open", url: "https://checkout.stripe.test/match", metadata: { checkoutAttemptId: oldAttemptId, priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] } });
    mocks.classifyCheckoutSessionIntent.mockReturnValue("match");
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/match", resumed: true });
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("fails closed when a live Checkout intent cannot be proven", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_unknown", status: "open", url: "https://checkout.stripe.test/unknown", metadata: { checkoutAttemptId: oldAttemptId }, line_items: { data: [] } });
    mocks.classifyCheckoutSessionIntent.mockReturnValue("unknown");
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "CHECKOUT_RECOVERY_UNAVAILABLE" });
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
  });

  it("recovers immediately from an already-expired old Stripe Checkout", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_expired", status: "expired", url: null, metadata: { checkoutAttemptId: oldAttemptId, priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] } });
    const response = await POST(request({ plan: "yearly", useTrial: false, callbackUrl: "/en/billing", checkoutAttemptId: ATTEMPT_ID }));
    expect(response.status).toBe(200);
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith("user_1", oldAttemptId);
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ priceId: "price_yearly" }));
  });

  it("never expires or replaces a completed conflicting Checkout", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_complete", status: "complete", url: null, metadata: { checkoutAttemptId: oldAttemptId }, line_items: { data: [] } });
    const response = await POST(request({ plan: "yearly", useTrial: false, callbackUrl: "/en/billing", checkoutAttemptId: ATTEMPT_ID }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "CHECKOUT_COMPLETED_RECONCILING" });
    expect(mocks.expireOpenCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("preserves the old reservation when Stripe expiration is uncertain", async () => {
    const oldAttemptId = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "conflict", reservedAt: new Date(), checkoutAttemptId: oldAttemptId });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_open", status: "open", url: "https://checkout.stripe.test/open", metadata: { checkoutAttemptId: oldAttemptId, priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] } });
    mocks.classifyCheckoutSessionIntent.mockReturnValue("mismatch");
    mocks.expireOpenCheckoutSession.mockRejectedValue(new Error("network uncertainty"));
    const response = await POST(request({ plan: "yearly", useTrial: false, callbackUrl: "/en/billing", checkoutAttemptId: ATTEMPT_ID }));
    expect(response.status).toBe(503);
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("retires a stale open same-attempt Checkout and asks for one fresh attempt", async () => {
    mocks.reserveBillingCheckout.mockResolvedValueOnce({ kind: "stale_attempt", reservedAt: new Date("2026-08-07T00:00:00.000Z") });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({ id: "cs_test_stale", status: "open", url: "https://checkout.stripe.test/stale", metadata: { checkoutAttemptId: ATTEMPT_ID, priceId: "price_monthly", useTrial: "false" }, line_items: { data: [] } });
    mocks.expireOpenCheckoutSession.mockResolvedValue({ id: "cs_test_stale", status: "expired" });
    const response = await POST(request());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "CHECKOUT_ATTEMPT_EXPIRED", retryable: true });
    expect(mocks.expireOpenCheckoutSession).toHaveBeenCalledWith("cs_test_stale");
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith("user_1", ATTEMPT_ID);
  });

});
