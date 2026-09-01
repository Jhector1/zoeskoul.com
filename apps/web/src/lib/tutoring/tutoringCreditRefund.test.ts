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
  "@/lib/prisma",
  () => ({
    prisma: {},
  }),
);

vi.mock(
  "@/lib/stripe",
  () => ({
    getStripe:
      vi.fn(),
  }),
);

import {
  isDefinitiveStripeRefundCreateFailure,
  isTutoringRefundAttemptId,
  requestTutoringCreditRefund,
} from "./tutoringCreditRefund";

describe(
  "tutoring credit refund runtime",
  () => {
    it(
      "validates UUID refund attempt identity",
      () => {
        expect(
          isTutoringRefundAttemptId(
            "11111111-1111-4111-8111-111111111111",
          ),
        ).toBe(true);

        expect(
          isTutoringRefundAttemptId(
            "refund-1",
          ),
        ).toBe(false);
      },
    );


    it(
      "treats Stripe 4xx create responses as definitive and 5xx/network failures as ambiguous",
      () => {
        expect(
          isDefinitiveStripeRefundCreateFailure({
            statusCode:
              400,
          }),
        ).toBe(true);

        expect(
          isDefinitiveStripeRefundCreateFailure({
            raw: {
              statusCode:
                429,
            },
          }),
        ).toBe(true);

        expect(
          isDefinitiveStripeRefundCreateFailure({
            statusCode:
              500,
          }),
        ).toBe(false);

        expect(
          isDefinitiveStripeRefundCreateFailure(
            new Error(
              "network",
            ),
          ),
        ).toBe(false);
      },
    );

    it(
      "uses the original PaymentIntent and server-computed partial amount",
      async () => {
        const purchase = {
          id:
            "purchase-1",
          userId:
            "user-1",
          packageMinutes:
            60,
          amountMinor:
            6600,
          currency:
            "usd",
          stripePaymentIntentId:
            "pi_1",
          status:
            "paid",
        };

        const refund = {
          id:
            "refund-1",
          purchaseId:
            "purchase-1",
          userId:
            "user-1",
          refundAttemptId:
            "11111111-1111-4111-8111-111111111111",
          minutes:
            40,
          amountMinor:
            4400,
          currency:
            "usd",
          stripeRefundId:
            null,
          status:
            "pending",
        };

        const tx = {
          tutoringCreditLedgerEntry: {
            findMany:
              vi.fn(
                async () => [
                  {
                    id: "e1",
                    kind:
                      "purchase_grant",
                    availableMinutesDelta:
                      60,
                    reservedMinutesDelta:
                      0,
                    purchaseId:
                      "purchase-1",
                    requestId:
                      null,
                    bookingId:
                      null,
                    createdAt:
                      new Date(
                        "2026-08-30T12:00:00Z",
                      ),
                  },
                ],
              ),
          },
          tutoringCreditPurchase: {
            findMany:
              vi.fn(
                async () => [
                  {
                    ...purchase,
                    paidAt:
                      new Date(
                        "2026-08-30T12:00:00Z",
                      ),
                    createdAt:
                      new Date(
                        "2026-08-30T12:00:00Z",
                      ),
                  },
                ],
              ),
            findUnique:
              vi.fn(
                async () =>
                  purchase,
              ),
          },
          tutoringCreditRefund: {
            findMany:
              vi.fn(
                async () =>
                  [],
              ),
            findUnique:
              vi.fn(
                async () =>
                  null,
              ),
            findFirst:
              vi.fn(
                async () =>
                  null,
              ),
            create:
              vi.fn(
                async () =>
                  refund,
              ),
            update:
              vi.fn(
                async () =>
                  refund,
              ),
          },
        };

        const db = {
          ...tx,
          $transaction:
            vi.fn(
              async (
                operation:
                  any,
              ) =>
                operation(tx),
            ),
        };

        const create =
          vi.fn(
            async (
              params:
                Stripe.RefundCreateParams,
            ) =>
              ({
                id: "re_1",
                object:
                  "refund",
                amount:
                  4400,
                currency:
                  "usd",
                payment_intent:
                  "pi_1",
                status:
                  "succeeded",
                metadata:
                  params.metadata ??
                  {},
              }) as
                Stripe.Refund,
          );

        await expect(
          requestTutoringCreditRefund(
            {
              userId:
                "user-1",
              refundAttemptId:
                "11111111-1111-4111-8111-111111111111",
              purchaseId:
                "purchase-1",
              minutes:
                40,
            },
            {
              db:
                db as any,
              stripe: {
                refunds: {
                  create,
                },
              } as unknown as
                Stripe,
            },
          ),
        ).resolves.toMatchObject({
          kind:
            "refund_pending",
          refundId:
            "refund-1",
          minutes:
            40,
          amountMinor:
            4400,
        });

        expect(
          create,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            payment_intent:
              "pi_1",
            amount:
              4400,
            reason:
              "requested_by_customer",
            metadata:
              expect.objectContaining({
                refundKind:
                  "tutoring_credit",
                purchaseId:
                  "purchase-1",
                userId:
                  "user-1",
                minutes:
                  "40",
                amountMinor:
                  "4400",
              }),
          }),
          {
            idempotencyKey:
              "zoeskoul-tutoring-refund:11111111-1111-4111-8111-111111111111",
          },
        );
      },
    );
  },
);
