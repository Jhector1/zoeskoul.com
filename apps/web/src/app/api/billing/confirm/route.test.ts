
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkoutRetrieve: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  upsert: vi.fn(),
  enforceSameOriginPost: vi.fn(),
  exceedsContentLength: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: mocks.checkoutRetrieve } },
    subscriptions: { retrieve: mocks.subscriptionRetrieve },
  }),
}));
vi.mock("@/lib/billing/stripeService", () => ({
  upsertFromStripeSubscription: mocks.upsert,
}));
vi.mock("@/lib/practice/api/shared/http", () => ({
  enforceSameOriginPost: mocks.enforceSameOriginPost,
  exceedsContentLength: mocks.exceedsContentLength,
  readJsonSafe: (req: Request) => req.json(),
}));

import { POST } from "./route";

function request(sessionId: string) {
  return new Request("https://zoeskoul.test/api/billing/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

function checkout(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "cs_test_abc123",
    mode: "subscription",
    status: "complete",
    metadata: {},
    client_reference_id: "user_1",
    customer: "cus_1",
    subscription: "sub_1",
    ...overrides,
  };
}

function subscription(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "sub_1",
    status: "active",
    metadata: { userId: "user_1" },
    customer: "cus_1",
    items: { data: [] },
    ...overrides,
  };
}

describe("billing confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.enforceSameOriginPost.mockReturnValue(true);
    mocks.exceedsContentLength.mockReturnValue(false);
    mocks.checkoutRetrieve.mockResolvedValue(checkout());
    mocks.subscriptionRetrieve.mockResolvedValue(subscription());
    mocks.upsert.mockResolvedValue({
      status: "active",
      priceId: "price_monthly",
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
      trialEnd: null,
      subscriptionId: "sub_1",
    });
  });

  it("rejects a malformed session id before any Stripe or DB call", async () => {
    const response = await POST(request("{CHECKOUT_SESSION_ID}"));

    expect(response.status).toBe(400);
    expect(mocks.checkoutRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a Checkout Session owned by another user", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      checkout({
        client_reference_id: "user_2",
        metadata: { userId: "user_2" },
      }),
    );

    const response = await POST(request("cs_test_abc123"));

    expect(response.status).toBe(403);
    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("accepts the historical client_reference_id ownership contract", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      checkout({
        metadata: {},
        client_reference_id: "user_1",
      }),
    );

    const response = await POST(request("cs_test_abc123"));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("blocks a Checkout/subscription customer mismatch before persistence", async () => {
    mocks.subscriptionRetrieve.mockResolvedValue(
      subscription({ customer: "cus_2" }),
    );

    const response = await POST(request("cs_test_abc123"));

    expect(response.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("reconciles a valid owned Checkout Session", async () => {
    mocks.checkoutRetrieve.mockResolvedValue(
      checkout({ metadata: { userId: "user_1" } }),
    );

    const response = await POST(request("cs_test_abc123"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "active",
      subscriptionId: "sub_1",
    });
    expect(mocks.subscriptionRetrieve).toHaveBeenCalledWith("sub_1");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_1" }),
      "user_1",
    );
  });
});
