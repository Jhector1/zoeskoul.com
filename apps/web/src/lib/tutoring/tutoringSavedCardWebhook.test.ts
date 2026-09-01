import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  isTutoringCreditPaymentIntentEvent,
  reconcileTutoringCreditPaymentIntentEvent,
  type TutoringCreditWebhookDeps,
} from "./tutoringCreditWebhook";

function event(
  type:
    | "payment_intent.succeeded"
    | "payment_intent.payment_failed",
) {
  return {
    id: "evt_1",
    type,
    created: 1_800_000_000,
    data: {
      object: {
        id: "pi_1",
        object:
          "payment_intent",
        status:
          type ===
          "payment_intent.succeeded"
            ? "succeeded"
            : "requires_payment_method",
        amount: 3300,
        amount_received:
          type ===
          "payment_intent.succeeded"
            ? 3300
            : 0,
        currency: "usd",
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
          packageMinutes:
            "30",
          amountMinor:
            "3300",
        },
      },
    },
  } as never;
}

function deps():
  TutoringCreditWebhookDeps {
  return {
    listCheckoutLineItems:
      vi.fn(
        async () => [],
      ),
    settlePaid:
      vi.fn(
        async () => ({
          kind: "credited" as const,
          purchaseId:
            "purchase_1",
          balance: {
            availableMinutes:
              30,
            reservedMinutes:
              0,
            totalMinutes:
              30,
          },
        }),
      ),
    markTerminal:
      vi.fn(
        async () => ({
          purchaseId:
            "purchase_1",
          status: "failed",
        }),
      ),
  };
}

describe(
  "saved-card tutoring webhook",
  () => {
    it(
      "settles payment_intent.succeeded without Checkout evidence",
      async () => {
        const e =
          event(
            "payment_intent.succeeded",
          );
        const d =
          deps();

        expect(
          isTutoringCreditPaymentIntentEvent(
            e,
          ),
        ).toBe(true);

        await expect(
          reconcileTutoringCreditPaymentIntentEvent(
            e,
            { deps: d },
          ),
        ).resolves.toMatchObject({
          kind: "credited",
          purchaseId:
            "purchase_1",
        });

        expect(
          d.settlePaid,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            checkoutSessionId:
              null,
            stripePriceId:
              null,
            paymentIntentId:
              "pi_1",
            paymentChannel:
              "saved_card",
            amountMinor: 3300,
            packageMinutes: 30,
          }),
        );
      },
    );

    it(
      "marks a direct saved-card failure without granting credit",
      async () => {
        const d =
          deps();

        await expect(
          reconcileTutoringCreditPaymentIntentEvent(
            event(
              "payment_intent.payment_failed",
            ),
            { deps: d },
          ),
        ).resolves.toMatchObject({
          kind:
            "terminal_updated",
          status: "failed",
        });

        expect(
          d.settlePaid,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
