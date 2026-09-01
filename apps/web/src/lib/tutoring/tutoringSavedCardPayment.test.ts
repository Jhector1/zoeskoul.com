import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTutoringSavedCardPayment,
  type TutoringSavedCardPaymentDeps,
} from "./tutoringSavedCardPayment";

function prepared() {
  return {
    purchase: {
      id: "purchase_1",
      userId: "learner_1",
      checkoutAttemptId:
        "00000000-0000-4000-8000-000000000001",
      packageMinutes: 30,
      amountMinor: 3300,
      currency: "usd",
      stripePriceId: null,
      stripeCheckoutSessionId:
        null,
      stripePaymentIntentId:
        null,
      status: "pending",
    },
    quote: {
      minutes: 30,
      amountMinor: 3300,
      currency: "usd",
      rateMinorPerMinute: 110,
      pricingVersion:
        "tutoring-usd-110-v1",
    },
  };
}

function intent(
  status:
    | "succeeded"
    | "requires_action"
    | "processing",
) {
  return {
    id: "pi_1",
    object: "payment_intent",
    amount: 3300,
    currency: "usd",
    customer: "cus_1",
    client_secret:
      "pi_1_secret_test",
    status,
    metadata: {
      purchaseKind:
        "tutoring_credit",
      paymentChannel:
        "saved_card",
      purchaseId:
        "purchase_1",
      userId:
        "learner_1",
      checkoutAttemptId:
        "00000000-0000-4000-8000-000000000001",
      packageMinutes: "30",
      amountMinor: "3300",
      currency: "usd",
      pricingVersion:
        "tutoring-usd-110-v1",
    },
  } as never;
}

function deps(
  status:
    | "succeeded"
    | "requires_action"
    | "processing",
): TutoringSavedCardPaymentDeps {
  return {
    preparePurchase:
      vi.fn(
        async () =>
          prepared() as never,
      ),
    authorizeCard:
      vi.fn(
        async () => ({
          customerId:
            "cus_1",
          paymentMethodId:
            "pm_private",
        }),
      ),
    createAndConfirmPaymentIntent:
      vi.fn(
        async () =>
          intent(status),
      ),
    retrievePaymentIntent:
      vi.fn(
        async () =>
          intent(status),
      ),
    persistPaymentIntent:
      vi.fn(
        async () => {},
      ),
  };
}

describe(
  "saved-card tutoring payment",
  () => {
    it(
      "confirms the saved card immediately with server-owned price and private payment method id",
      async () => {
        const d =
          deps("succeeded");

        await expect(
          createTutoringSavedCardPayment(
            {
              userId:
                "learner_1",
              checkoutAttemptId:
                "00000000-0000-4000-8000-000000000001",
              minutes: 30,
            },
            {
              deps: d,
              env: {
                LEARNOIR_STRIPE_PUBLISHABLE_KEY:
                  "pk_test_example",
              },
            },
          ),
        ).resolves.toEqual({
          kind:
            "saved_card_paid_pending_webhook",
          purchaseId:
            "purchase_1",
        });

        expect(
          d.createAndConfirmPaymentIntent,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 3300,
            currency: "usd",
            customer: "cus_1",
            payment_method:
              "pm_private",
            payment_method_types: [
              "card",
            ],
            confirm: true,
            use_stripe_sdk: true,
            metadata:
              expect.objectContaining({
                paymentChannel:
                  "saved_card",
                amountMinor:
                  "3300",
              }),
          }),
          "zoeskoul-tutoring-saved-card:00000000-0000-4000-8000-000000000001",
        );
      },
    );

    it(
      "returns only a client secret when Stripe requires customer authentication",
      async () => {
        await expect(
          createTutoringSavedCardPayment(
            {
              userId:
                "learner_1",
              checkoutAttemptId:
                "00000000-0000-4000-8000-000000000001",
              minutes: 30,
            },
            {
              deps:
                deps(
                  "requires_action",
                ),
              env: {
                LEARNOIR_STRIPE_PUBLISHABLE_KEY:
                  "pk_test_example",
              },
            },
          ),
        ).resolves.toEqual({
          kind:
            "saved_card_requires_action",
          purchaseId:
            "purchase_1",
          clientSecret:
            "pi_1_secret_test",
          publishableKey:
            "pk_test_example",
        });
      },
    );
  },
);
