import { beforeEach, describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "4c37ca16-f26d-4f90-8b12-76b1f387f670";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  findExistingCheckoutSessionForAttempt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/billing/stripeService", () => ({
  findExistingCheckoutSessionForAttempt:
    mocks.findExistingCheckoutSessionForAttempt,
}));

import { GET } from "./route";

function request() {
  return new Request(
    "https://zoeskoul.test/api/billing/checkout/resume",
  );
}

describe("pending Checkout resume redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: { id: "user_1" },
    });
    mocks.userFindUnique.mockResolvedValue({
      billingCheckoutAttemptId: ATTEMPT_ID,
    });
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_test_abc",
      metadata: {
        checkoutAttemptId: ATTEMPT_ID,
      },
    });
  });

  it("redirects directly to the verified open Stripe Checkout", async () => {
    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_abc",
    );
    expect(
      mocks.findExistingCheckoutSessionForAttempt,
    ).toHaveBeenCalledWith({
      userId: "user_1",
      checkoutAttemptId: ATTEMPT_ID,
    });
  });

  it("falls back to Billing when no durable pending reservation exists", async () => {
    mocks.userFindUnique.mockResolvedValue({
      billingCheckoutAttemptId: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://zoeskoul.test/billing",
    );
    expect(
      mocks.findExistingCheckoutSessionForAttempt,
    ).not.toHaveBeenCalled();
  });

  it("never resumes an expired or completed Checkout", async () => {
    for (const status of ["expired", "complete"]) {
      mocks.findExistingCheckoutSessionForAttempt.mockResolvedValueOnce({
        id: `cs_test_${status}`,
        status,
        url: "https://checkout.stripe.com/c/pay/cs_test_old",
      });

      const response = await GET(request());
      expect(response.headers.get("location")).toBe(
        "https://zoeskoul.test/billing",
      );
    }
  });

  it("rejects an untrusted redirect URL even when state says open", async () => {
    mocks.findExistingCheckoutSessionForAttempt.mockResolvedValue({
      id: "cs_test_open",
      status: "open",
      url: "https://example.com/not-stripe",
    });

    const response = await GET(request());

    expect(response.headers.get("location")).toBe(
      "https://zoeskoul.test/billing",
    );
  });

  it("sends an expired login through website auth", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://zoeskoul.test/auth/signin?callbackUrl=%2Fbilling",
    );
  });

  it("fails closed to Billing when Stripe verification is unavailable", async () => {
    mocks.findExistingCheckoutSessionForAttempt.mockRejectedValue(
      new Error("Stripe unavailable"),
    );

    const response = await GET(request());

    expect(response.headers.get("location")).toBe(
      "https://zoeskoul.test/billing",
    );
  });
});
