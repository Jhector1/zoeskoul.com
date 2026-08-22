import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getEntitlementForUser: vi.fn(),
  syncSubscriptionsForUser: vi.fn(),
  resumeScheduledSubscriptionForUser: vi.fn(),
  enforceSameOriginPost: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));
vi.mock("@/lib/billing/entitlement", () => ({
  getEntitlementForUser: mocks.getEntitlementForUser,
}));
vi.mock("@/lib/billing/stripeService", () => ({
  syncSubscriptionsForUser: mocks.syncSubscriptionsForUser,
  resumeScheduledSubscriptionForUser:
    mocks.resumeScheduledSubscriptionForUser,
}));
vi.mock("@/lib/practice/api/shared/http", () => ({
  enforceSameOriginPost: mocks.enforceSameOriginPost,
}));

import { POST } from "./route";

function request() {
  return new Request(
    "https://zoeskoul.test/api/billing/subscription/resume",
    { method: "POST" },
  );
}

describe("billing subscription resume route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceSameOriginPost.mockReturnValue(true);
    mocks.auth.mockResolvedValue({
      user: { id: "user_1" },
    });
    mocks.syncSubscriptionsForUser.mockResolvedValue(undefined);
    mocks.getEntitlementForUser.mockResolvedValue({
      ok: true,
      reason: "trialing",
      status: "trialing",
      subscriptionId: "sub_1",
      priceId: "price_monthly",
      trialEnd: new Date("2100-01-02T00:00:00.000Z"),
      currentPeriodEnd: new Date("2100-02-02T00:00:00.000Z"),
      cancelAtPeriodEnd: true,
    });
    mocks.resumeScheduledSubscriptionForUser.mockResolvedValue({
      userId: "user_1",
      status: "trialing",
      subscriptionId: "sub_1",
      priceId: "price_monthly",
      trialEnd: new Date("2100-01-02T00:00:00.000Z"),
      currentPeriodEnd: new Date("2100-02-02T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    });
  });

  it("resumes a scheduled trial cancellation without Checkout", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      subscriptionId: "sub_1",
      cancelAtPeriodEnd: false,
    });
    expect(
      mocks.resumeScheduledSubscriptionForUser,
    ).toHaveBeenCalledWith({
      userId: "user_1",
      subscriptionId: "sub_1",
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.syncSubscriptionsForUser).not.toHaveBeenCalled();
  });

  it("rejects a subscription whose scheduled cancellation is no longer resumable", async () => {
    mocks.getEntitlementForUser.mockResolvedValue({
      ok: false,
      reason: "expired",
      status: "trialing",
      subscriptionId: "sub_1",
      priceId: "price_monthly",
      trialEnd: new Date("2000-01-02T00:00:00.000Z"),
      currentPeriodEnd: new Date("2100-02-02T00:00:00.000Z"),
      cancelAtPeriodEnd: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "NO_SCHEDULED_CANCELLATION",
    });
    expect(
      mocks.resumeScheduledSubscriptionForUser,
    ).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe freshness cannot be verified", async () => {
    mocks.syncSubscriptionsForUser.mockRejectedValue(
      new Error("Stripe unavailable"),
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "BILLING_SYNC_UNAVAILABLE",
    });
    expect(mocks.getEntitlementForUser).not.toHaveBeenCalled();
  });
});
