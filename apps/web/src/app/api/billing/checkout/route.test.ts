
import { beforeEach, describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "4c37ca16-f26d-4f90-8b12-76b1f387f670";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  createCheckoutSession: vi.fn(),
  syncSubscriptionsForUser: vi.fn(),
  getEntitlementForUser: vi.fn(),
  getLocaleFromCookie: vi.fn(),
  resolveBillingCurrency: vi.fn(),
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
  createCheckoutSession: mocks.createCheckoutSession,
  syncSubscriptionsForUser: mocks.syncSubscriptionsForUser,
}));
vi.mock("@/lib/billing/entitlement", () => ({
  getEntitlementForUser: mocks.getEntitlementForUser,
}));
vi.mock("@/lib/billing/currency", () => ({
  resolveBillingCurrency: mocks.resolveBillingCurrency,
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

  it("blocks a distinct concurrent paid or trial Checkout before Stripe work", async () => {
    mocks.reserveBillingCheckout.mockResolvedValue({
      kind: "conflict",
      reservedAt: new Date("2026-08-07T02:29:00.000Z"),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "CHECKOUT_ALREADY_IN_PROGRESS",
    });
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
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
    expect(mocks.releaseBillingCheckoutReservation).toHaveBeenCalledWith(
      "user_1",
      ATTEMPT_ID,
    );
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

  it("keeps the reservation after an indeterminate Checkout create failure", async () => {
    mocks.createCheckoutSession.mockRejectedValue(
      new Error("connection reset"),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.releaseBillingCheckoutReservation).not.toHaveBeenCalled();
  });
});
