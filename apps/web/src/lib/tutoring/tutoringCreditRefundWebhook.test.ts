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

function currentRefund(status: string, overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    ...event(status).data.object,
    ...overrides,
  } as Stripe.Refund;
}

function mockDeps(status: string): import("./tutoringCreditRefundWebhook").TutoringCreditRefundWebhookDeps {
  return {
    retrieveRefund: vi.fn(async () => currentRefund(status)),
    retrievePaymentIntent: vi.fn(async () => ({ id: "pi_1", livemode: false, currency: "usd" })),
    settleSucceeded: vi.fn(async () => ({
      kind: "refunded" as const, refundId: "refund-1", purchaseFullyRefunded: false,
    })),
    updateStatus: vi.fn(async () => ({ refundId: "refund-1", status })),
  };
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
                retrieveRefund: vi.fn(async () => currentRefund("succeeded")),
                retrievePaymentIntent: vi.fn(async () => ({ id: "pi_1", livemode: false, currency: "usd" })),
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
              retrieveRefund: vi.fn(async () => currentRefund("failed")),
              retrievePaymentIntent: vi.fn(async () => ({ id: "pi_1", livemode: false, currency: "usd" })),
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

    it("uses Stripe's current failed status instead of a delayed succeeded snapshot", async () => {
      const d = mockDeps("failed");
      await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
        .resolves.toEqual({ kind: "status_updated", refundId: "refund-1", status: "failed" });
      expect(d.retrieveRefund).toHaveBeenCalledWith("re_1");
      expect(d.settleSucceeded).not.toHaveBeenCalled();
      expect(d.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    });

    it("settles only when Stripe currently confirms success despite a stale failure event", async () => {
      const d = mockDeps("succeeded");
      await expect(reconcileTutoringCreditRefundEvent(event("failed"), { deps: d }))
        .resolves.toEqual({ kind: "refunded", refundId: "refund-1" });
      expect(d.settleSucceeded).toHaveBeenCalledTimes(1);
      expect(d.updateStatus).not.toHaveBeenCalled();
    });

    it("refuses mismatched current refund identity or ownership metadata", async () => {
      for (const overrides of [
        { id: "re_other" },
        { metadata: { refundKind: "other_product" } },
        { object: "payment_intent" },
        { status: "unknown_status" },
      ] as Array<Partial<Stripe.Refund>>) {
        const d = mockDeps("succeeded");
        d.retrieveRefund = vi.fn(async () => currentRefund("succeeded", overrides));
        await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
          .rejects.toThrow("TUTORING_STRIPE_REFUND_NOT_VERIFIED");
        expect(d.settleSucceeded).not.toHaveBeenCalled();
        expect(d.updateStatus).not.toHaveBeenCalled();
      }
    });

    it("rejects changed amount, currency or PaymentIntent before touching the ledger", async () => {
      for (const overrides of [
        { amount: 4200 },
        { currency: "eur" },
        { payment_intent: null },
      ] as Array<Partial<Stripe.Refund>>) {
        const d = mockDeps("succeeded");
        d.retrieveRefund = vi.fn(async () => currentRefund("succeeded", overrides));
        await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
          .rejects.toThrow();
        expect(d.settleSucceeded).not.toHaveBeenCalled();
        expect(d.updateStatus).not.toHaveBeenCalled();
      }
    });

    it("checks the verified PaymentIntent environment, identity and currency", async () => {
      for (const altered of [
        { id: "pi_wrong" },
        { livemode: true },
        { currency: "eur" },
      ]) {
        const d = mockDeps("succeeded");
        d.retrievePaymentIntent = vi.fn(async () => ({
          id: "pi_1", livemode: false, currency: "usd", ...altered,
        }));
        await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
          .rejects.toThrow("TUTORING_STRIPE_REFUND_PAYMENT_NOT_VERIFIED");
        expect(d.retrievePaymentIntent).toHaveBeenCalledWith("pi_1");
        expect(d.settleSucceeded).not.toHaveBeenCalled();
        expect(d.updateStatus).not.toHaveBeenCalled();
      }
    });

    it("fails closed if current PaymentIntent retrieval is unavailable", async () => {
      const d = mockDeps("succeeded");
      d.retrievePaymentIntent = vi.fn(async () => {
        throw new Error("Stripe PaymentIntent lookup unavailable");
      });
      await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
        .rejects.toThrow("Stripe PaymentIntent lookup unavailable");
      expect(d.settleSucceeded).not.toHaveBeenCalled();
      expect(d.updateStatus).not.toHaveBeenCalled();
    });

    it("retries a failed provider lookup rather than trusting historical webhook data", async () => {
      const d = mockDeps("succeeded");
      d.retrieveRefund = vi.fn(async () => { throw new Error("Stripe temporarily unavailable"); });
      await expect(reconcileTutoringCreditRefundEvent(event("succeeded"), { deps: d }))
        .rejects.toThrow("Stripe temporarily unavailable");
      expect(d.settleSucceeded).not.toHaveBeenCalled();
      expect(d.updateStatus).not.toHaveBeenCalled();
    });
  },
);
