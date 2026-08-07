
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_ATTEMPT_REUSE_TTL_MS,
  CHECKOUT_ATTEMPT_STORAGE_KEY,
  buildStripeCheckoutIdempotencyKey,
  checkoutAttemptFingerprint,
  clearBrowserCheckoutAttempt,
  getOrCreateBrowserCheckoutAttempt,
  isCheckoutAttemptId,
  isCheckoutSessionId,
} from "./checkoutAttempt";

const ATTEMPT_A = "4c37ca16-f26d-4f90-8b12-76b1f387f670";
const ATTEMPT_B = "7f9f8c4d-6a75-4e34-9e2f-6bf07aaf6971";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    values,
  };
}

const input = {
  plan: "monthly" as const,
  useTrial: true,
  callbackUrl: "/en/subjects/sql",
};

describe("Checkout attempt contract", () => {
  it("accepts only UUID v4 attempt ids and Stripe Checkout Session ids", () => {
    expect(isCheckoutAttemptId(ATTEMPT_A)).toBe(true);
    expect(isCheckoutAttemptId("not-a-uuid")).toBe(false);
    expect(isCheckoutAttemptId("4c37ca16-f26d-3f90-8b12-76b1f387f670")).toBe(false);

    expect(isCheckoutSessionId("cs_test_abc123")).toBe(true);
    expect(isCheckoutSessionId("cs_live_ABC123")).toBe(true);
    expect(isCheckoutSessionId("{CHECKOUT_SESSION_ID}")).toBe(false);
    expect(isCheckoutSessionId("pi_test_abc123")).toBe(false);
  });

  it("builds a stable non-PII Stripe idempotency key", () => {
    expect(buildStripeCheckoutIdempotencyKey(ATTEMPT_A)).toBe(
      `zoeskoul-checkout:${ATTEMPT_A}`,
    );
  });

  it("reuses the same browser attempt only for the same fingerprint inside the retry window", () => {
    const store = storage();

    const first = getOrCreateBrowserCheckoutAttempt(input, {
      storage: store,
      nowMs: 1_000,
      randomUuid: () => ATTEMPT_A,
    });
    const retry = getOrCreateBrowserCheckoutAttempt(input, {
      storage: store,
      nowMs: 1_000 + CHECKOUT_ATTEMPT_REUSE_TTL_MS,
      randomUuid: () => ATTEMPT_B,
    });

    expect(first).toBe(ATTEMPT_A);
    expect(retry).toBe(ATTEMPT_A);
  });

  it("creates a new attempt when parameters change or the retry window expires", () => {
    const store = storage();

    getOrCreateBrowserCheckoutAttempt(input, {
      storage: store,
      nowMs: 1_000,
      randomUuid: () => ATTEMPT_A,
    });

    expect(
      getOrCreateBrowserCheckoutAttempt(
        { ...input, plan: "yearly" },
        {
          storage: store,
          nowMs: 2_000,
          randomUuid: () => ATTEMPT_B,
        },
      ),
    ).toBe(ATTEMPT_B);

    store.setItem(
      CHECKOUT_ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        id: ATTEMPT_A,
        fingerprint: checkoutAttemptFingerprint(input),
        createdAtMs: 1_000,
      }),
    );

    expect(
      getOrCreateBrowserCheckoutAttempt(input, {
        storage: store,
        nowMs: 1_001 + CHECKOUT_ATTEMPT_REUSE_TTL_MS,
        randomUuid: () => ATTEMPT_B,
      }),
    ).toBe(ATTEMPT_B);
  });

  it("clears only the matching stored attempt when an id is supplied", () => {
    const store = storage();

    getOrCreateBrowserCheckoutAttempt(input, {
      storage: store,
      nowMs: 1_000,
      randomUuid: () => ATTEMPT_A,
    });

    expect(
      clearBrowserCheckoutAttempt(ATTEMPT_B, { storage: store }),
    ).toBe(false);
    expect(store.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)).not.toBeNull();

    expect(
      clearBrowserCheckoutAttempt(ATTEMPT_A, { storage: store }),
    ).toBe(true);
    expect(store.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)).toBeNull();
  });
});
