
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BILLING_CHECKOUT_RESERVATION_TTL_MS,
  BILLING_CHECKOUT_RETRY_TTL_MS,
  releaseBillingCheckoutReservation,
  reserveBillingCheckout,
  type BillingCheckoutReservationClient,
} from "./billingCheckoutReservation";

const USER_ID = "user_1";
const ATTEMPT_A = "4c37ca16-f26d-4f90-8b12-76b1f387f670";
const ATTEMPT_B = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";
const NOW = new Date("2026-08-07T02:30:00.000Z");

function client(args: {
  row: {
    billingCheckoutAttemptId: string | null;
    billingCheckoutReservedAt: Date | null;
  } | null;
  updateCount?: number;
}): BillingCheckoutReservationClient {
  return {
    user: {
      findUnique: vi.fn(async () => args.row),
      updateMany: vi.fn(async () => ({
        count: args.updateCount ?? 1,
      })),
    },
  };
}

describe("billing Checkout reservation", () => {
  it("atomically reserves the first subscription Checkout attempt", async () => {
    const store = client({
      row: {
        billingCheckoutAttemptId: null,
        billingCheckoutReservedAt: null,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_A, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "reserved",
      reservedAt: NOW,
      reused: false,
    });

    expect(store.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: USER_ID,
        billingCheckoutAttemptId: null,
        billingCheckoutReservedAt: null,
      },
      data: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: NOW,
      },
    });
  });

  it("reuses the same recent attempt without moving its reservation timestamp", async () => {
    const reservedAt = new Date(
      NOW.getTime() - BILLING_CHECKOUT_RETRY_TTL_MS + 1,
    );
    const store = client({
      row: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: reservedAt,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_A, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "reserved",
      reservedAt,
      reused: true,
    });

    expect(store.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects old reuse of the same attempt so Stripe request parameters cannot drift", async () => {
    const reservedAt = new Date(
      NOW.getTime() - BILLING_CHECKOUT_RETRY_TTL_MS - 1,
    );
    const store = client({
      row: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: reservedAt,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_A, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "stale_attempt",
      reservedAt,
    });
  });

  it("blocks a different paid or trial Checkout while one is still reserved", async () => {
    const reservedAt = new Date(NOW.getTime() - 60_000);
    const store = client({
      row: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: reservedAt,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_B, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "conflict",
      reservedAt,
    });
  });

  it("replaces an abandoned reservation after its safety TTL", async () => {
    const reservedAt = new Date(
      NOW.getTime() - BILLING_CHECKOUT_RESERVATION_TTL_MS - 1,
    );
    const store = client({
      row: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: reservedAt,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_B, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "reserved",
      reservedAt: NOW,
      reused: false,
    });
  });

  it("treats a future reservation timestamp as live instead of stealing it", async () => {
    const reservedAt = new Date(NOW.getTime() + 5 * 60 * 1000);
    const store = client({
      row: {
        billingCheckoutAttemptId: ATTEMPT_A,
        billingCheckoutReservedAt: reservedAt,
      },
    });

    await expect(
      reserveBillingCheckout(USER_ID, ATTEMPT_B, {
        client: store,
        now: NOW,
      }),
    ).resolves.toEqual({
      kind: "conflict",
      reservedAt,
    });
  });

  it("releases only the matching attempt", async () => {
    const matching = client({ row: null, updateCount: 1 });
    const missing = client({ row: null, updateCount: 0 });

    await expect(
      releaseBillingCheckoutReservation(USER_ID, ATTEMPT_A, {
        client: matching,
      }),
    ).resolves.toBe(true);

    expect(matching.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: USER_ID,
        billingCheckoutAttemptId: ATTEMPT_A,
      },
      data: {
        billingCheckoutAttemptId: null,
        billingCheckoutReservedAt: null,
      },
    });

    await expect(
      releaseBillingCheckoutReservation(USER_ID, ATTEMPT_B, {
        client: missing,
      }),
    ).resolves.toBe(false);
  });
});
