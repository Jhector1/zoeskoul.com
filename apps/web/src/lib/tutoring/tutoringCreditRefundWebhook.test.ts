import type Stripe from "stripe";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "server-only",
  () => ({}),
);

vi.mock(
  "@/lib/tutoring/tutoringCreditRefund",
  () => ({
    settleSucceededTutoringCreditRefund:
      vi.fn(),
    updateTutoringCreditRefundStatus:
      vi.fn(),
  }),
);

import {
  isTutoringCreditRefundEvent,
  reconcileTutoringCreditRefundEvent,
} from "./tutoringCreditRefundWebhook";

function event(
  status: string,
): Stripe.Event {
  return {
    id:
      "evt_refund_1",
    object:
      "event",
    api_version:
      "2026-06-30.basil",
    created:
      1787958000,
    livemode: false,
    pending_webhooks:
      1,
    request: null,
    type:
      status === "failed"
        ? "refund.failed"
        : "refund.updated",
    data: {
      object: {
        id: "re_1",
        object:
          "refund",
        amount:
          4400,
        currency:
          "usd",
        payment_intent:
          "pi_1",
        status,
        failure_reason:
          status ===
            "failed"
            ? "expired_or_canceled_card"
            : null,
        metadata: {
          refundKind:
            "tutoring_credit",
          refundId:
            "refund-1",
          refundAttemptId:
            "11111111-1111-4111-8111-111111111111",
          purchaseId:
            "purchase-1",
          userId:
            "user-1",
          minutes:
            "40",
          amountMinor:
            "4400",
          currency:
            "usd",
        },
      },
    },
  } as unknown as
    Stripe.Event;
}

describe(
  "tutoring credit refund webhook",
  () => {
    it(
      "recognizes tutoring refund metadata",
      () => {
        expect(
          isTutoringCreditRefundEvent(
            event(
              "succeeded",
            ),
          ),
        ).toBe(true);
      },
    );

    it(
      "settles succeeded refunds through the settlement owner",
      async () => {
        const settleSucceeded =
          vi.fn(
            async () => ({
              kind:
                "refunded" as const,
              refundId:
                "refund-1",
              purchaseFullyRefunded:
                false,
            }),
          );

        await expect(
          reconcileTutoringCreditRefundEvent(
            event(
              "succeeded",
            ),
            {
              deps: {
                settleSucceeded,
                updateStatus:
                  vi.fn(),
              },
            },
          ),
        ).resolves.toEqual({
          kind:
            "refunded",
          refundId:
            "refund-1",
        });

        expect(
          settleSucceeded,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            refundId:
              "refund-1",
            stripeRefundId:
              "re_1",
            paymentIntentId:
              "pi_1",
            minutes:
              40,
            amountMinor:
              4400,
          }),
        );
      },
    );

    it(
      "marks failed refunds without a ledger debit in the adapter",
      async () => {
        const updateStatus =
          vi.fn(
            async () => ({
              refundId:
                "refund-1",
              status:
                "failed",
            }),
          );

        await reconcileTutoringCreditRefundEvent(
          event(
            "failed",
          ),
          {
            deps: {
              settleSucceeded:
                vi.fn(),
              updateStatus,
            },
          },
        );

        expect(
          updateStatus,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              "failed",
          }),
        );
      },
    );
  },
);
