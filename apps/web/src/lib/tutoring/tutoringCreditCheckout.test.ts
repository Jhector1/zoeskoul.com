import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTutoringCreditCheckout,
  type TutoringCreditCheckoutDeps,
} from "./tutoringCreditCheckout";

const ATTEMPT_ID =
  "11111111-1111-4111-8111-111111111111";
const ENV = {
  AUTH_URL: "https://zoeskoul.test",
} as const;

function pendingPurchase(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "purchase-1",
    userId: "learner-1",
    checkoutAttemptId: ATTEMPT_ID,
    packageMinutes: 60,
    amountMinor: 6600,
    currency: "usd",
    stripePriceId: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    status: "pending",
    ...overrides,
  };
}

function deps(
  overrides:
    Partial<TutoringCreditCheckoutDeps> = {},
): TutoringCreditCheckoutDeps {
  return {
    findPurchase: vi.fn(async () => null),
    createPurchase: vi.fn(
      async (args) =>
        pendingPurchase({
          packageMinutes:
            args.quote.minutes,
          amountMinor:
            args.quote.amountMinor,
          currency:
            args.quote.currency,
        }),
    ),
    updatePurchaseSession:
      vi.fn(async () => undefined),
    ensureCustomer:
      vi.fn(async () => "cus_1"),
    createCheckoutSession:
      vi.fn(async () => ({
        id: "cs_1",
        status: "open" as const,
        payment_status:
          "unpaid" as const,
        url:
          "https://checkout.stripe.test/cs_1",
      })),
    retrieveCheckoutSession:
      vi.fn(async () => ({
        id: "cs_1",
        status: "open" as const,
        payment_status:
          "unpaid" as const,
        url:
          "https://checkout.stripe.test/cs_1",
      })),
    ...overrides,
  };
}

describe("tutoring credit Checkout", () => {
  it("calculates money server-side and uses inline Stripe price_data", async () => {
    const d = deps();

    const result =
      await createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 60,
          callbackPath:
            "/en/tutoring-sessions",
        },
        { deps: d, env: ENV },
      );

    expect(result.kind).toBe(
      "checkout",
    );
    expect(
      d.createPurchase,
    ).toHaveBeenCalledWith({
      userId: "learner-1",
      checkoutAttemptId: ATTEMPT_ID,
      quote: {
        minutes: 60,
        amountMinor: 6600,
        currency: "usd",
        rateMinorPerMinute: 110,
        pricingVersion:
          "flat-usd-110-per-minute-v1",
      },
    });

    expect(
      d.createCheckoutSession,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer: "cus_1",
        line_items: [
          expect.objectContaining({
            price_data:
              expect.objectContaining({
                currency: "usd",
                unit_amount: 6600,
              }),
            quantity: 1,
          }),
        ],
        metadata:
          expect.objectContaining({
            packageMinutes: "60",
            amountMinor: "6600",
            currency: "usd",
            rateMinorPerMinute: "110",
            pricingVersion:
              "flat-usd-110-per-minute-v1",
          }),
      }),
      `zoeskoul-tutoring-credit:${ATTEMPT_ID}`,
    );
  });

  it("creates Embedded Checkout with a client secret and no hosted redirect URLs", async () => {
    const d = deps({
      createCheckoutSession:
        vi.fn(async () => ({
          id: "cs_embedded",
          status: "open" as const,
          payment_status:
            "unpaid" as const,
          url: null,
          client_secret:
            "cs_test_embedded_secret",
        })),
    });

    const result =
      await createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 100,
          uiMode: "embedded",
        },
        {
          deps: d,
          env: {
            ...ENV,
            STRIPE_PUBLISHABLE_KEY:
              "pk_test_zoeskoul",
          },
        },
      );

    expect(result).toEqual({
      kind: "embedded_checkout",
      purchaseId: "purchase-1",
      checkoutSessionId:
        "cs_embedded",
      clientSecret:
        "cs_test_embedded_secret",
      publishableKey:
        "pk_test_zoeskoul",
      resumed: false,
    });

    const params =
      vi.mocked(
        d.createCheckoutSession,
      ).mock.calls[0]?.[0];

    expect(params).toEqual(
      expect.objectContaining({
        mode: "payment",
        ui_mode: "embedded",
        redirect_on_completion:
          "never",
        saved_payment_method_options: {
          payment_method_save:
            "enabled",
        },
      }),
    );
    expect(params).not.toHaveProperty(
      "success_url",
    );
    expect(params).not.toHaveProperty(
      "cancel_url",
    );
  });

  it("supports a four-hour 240-minute purchase", async () => {
    const d = deps();

    await createTutoringCreditCheckout(
      {
        userId: "learner-1",
        checkoutAttemptId: ATTEMPT_ID,
        minutes: 240,
      },
      { deps: d, env: ENV },
    );

    expect(
      d.createPurchase,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        quote:
          expect.objectContaining({
            minutes: 240,
            amountMinor: 26400,
          }),
      }),
    );
  });

  it("rejects below-minimum minutes and the sanity ceiling", async () => {
    const d = deps();

    await expect(
      createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 29,
        },
        { deps: d, env: ENV },
      ),
    ).rejects.toThrow(
      "whole minutes",
    );

    await expect(
      createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 735,
        },
        { deps: d, env: ENV },
      ),
    ).rejects.toThrow("between 30 and 720");
  });

  it("resumes an open Checkout for the same calculated purchase", async () => {
    const d = deps({
      findPurchase: vi.fn(
        async () =>
          pendingPurchase({
            stripeCheckoutSessionId:
              "cs_existing",
          }),
      ),
      retrieveCheckoutSession:
        vi.fn(async () => ({
          id: "cs_existing",
          status: "open" as const,
          payment_status:
            "unpaid" as const,
          url:
            "https://checkout.stripe.test/cs_existing",
        })),
    });

    const result =
      await createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 60,
        },
        { deps: d, env: ENV },
      );

    expect(result).toEqual({
      kind: "checkout",
      purchaseId: "purchase-1",
      checkoutSessionId:
        "cs_existing",
      url:
        "https://checkout.stripe.test/cs_existing",
      resumed: true,
    });
    expect(
      d.createCheckoutSession,
    ).not.toHaveBeenCalled();
  });

  it("rejects a reused attempt when requested minutes differ", async () => {
    const d = deps({
      findPurchase: vi.fn(
        async () =>
          pendingPurchase({
            packageMinutes: 30,
            amountMinor: 3300,
          }),
      ),
    });

    await expect(
      createTutoringCreditCheckout(
        {
          userId: "learner-1",
          checkoutAttemptId:
            ATTEMPT_ID,
          minutes: 60,
        },
        { deps: d, env: ENV },
      ),
    ).rejects.toThrow(
      "Existing tutoring credit purchase does not match this checkout attempt.",
    );
  });
});
