import {
  describe,
  expect,
  it,
} from "vitest";

import {
  replayTutoringCreditRefundProvenance,
  type TutoringRefundLedgerEntry,
  type TutoringRefundPurchaseSnapshot,
} from "./tutoringCreditRefundProvenance";

const BASE =
  new Date(
    "2026-08-30T12:00:00.000Z",
  );

function at(
  seconds: number,
) {
  return new Date(
    BASE.getTime() +
      seconds *
        1000,
  );
}

function purchase(
  id: string,
  minutes: number,
): TutoringRefundPurchaseSnapshot {
  return {
    id,
    packageMinutes:
      minutes,
    amountMinor:
      minutes *
      110,
    currency: "usd",
    status: "paid",
    paidAt: at(0),
    createdAt: at(0),
  };
}

function entry(
  args: {
    id: string;
    kind: string;
    available: number;
    reserved?: number;
    purchaseId?: string;
    requestId?: string | null;
    bookingId?: string | null;
    at: number;
  },
): TutoringRefundLedgerEntry {
  return {
    id: args.id,
    kind: args.kind,
    availableMinutesDelta:
      args.available,
    reservedMinutesDelta:
      args.reserved ??
      0,
    purchaseId:
      args.purchaseId ??
      null,
    requestId:
      args.requestId ??
      null,
    bookingId:
      args.bookingId ??
      null,
    createdAt:
      at(args.at),
  };
}

describe(
  "tutoring credit refund provenance",
  () => {
    it(
      "keeps a wholly unused purchase fully refundable",
      () => {
        const result =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p1",
                at: 1,
              }),
            ],
          });

        expect(
          result.purchases[0],
        ).toMatchObject({
          purchaseId: "p1",
          refundableMinutes:
            60,
          reservedPurchasedMinutes:
            0,
          refundableAmountMinor:
            6600,
        });
      },
    );

    it(
      "consumes non-cash minutes before purchased minutes",
      () => {
        const result =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "admin_grant",
                available: 30,
                at: 1,
              }),
              entry({
                id: "e2",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p1",
                at: 2,
              }),
              entry({
                id: "e3",
                kind:
                  "reservation",
                available: -20,
                reserved: 20,
                bookingId:
                  "b1",
                at: 3,
              }),
              entry({
                id: "e4",
                kind:
                  "session_consumption",
                available: 0,
                reserved: -20,
                bookingId:
                  "b1",
                at: 4,
              }),
            ],
          });

        expect(
          result.purchases[0]
            ?.refundableMinutes,
        ).toBe(60);

        expect(
          result.nonCashAvailableMinutes,
        ).toBe(10);
      },
    );

    it(
      "holds purchased minutes used by a scheduled booking and restores the same buckets on release",
      () => {
        const beforeRelease =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "admin_grant",
                available: 10,
                at: 1,
              }),
              entry({
                id: "e2",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p1",
                at: 2,
              }),
              entry({
                id: "e3",
                kind:
                  "reservation",
                available: -30,
                reserved: 30,
                bookingId:
                  "b1",
                at: 3,
              }),
            ],
          });

        expect(
          beforeRelease
            .purchases[0],
        ).toMatchObject({
          refundableMinutes:
            40,
          reservedPurchasedMinutes:
            20,
        });

        const afterRelease =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "admin_grant",
                available: 10,
                at: 1,
              }),
              entry({
                id: "e2",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p1",
                at: 2,
              }),
              entry({
                id: "e3",
                kind:
                  "reservation",
                available: -30,
                reserved: 30,
                bookingId:
                  "b1",
                at: 3,
              }),
              entry({
                id: "e4",
                kind:
                  "reservation_release",
                available: 30,
                reserved: -30,
                bookingId:
                  "b1",
                at: 4,
              }),
            ],
          });

        expect(
          afterRelease
            .purchases[0],
        ).toMatchObject({
          refundableMinutes:
            60,
          reservedPurchasedMinutes:
            0,
        });
      },
    );

    it(
      "tracks a request reservation through later booking consumption",
      () => {
        const result = replayTutoringCreditRefundProvenance({
          purchases: [purchase("p1", 60)],
          entries: [
            entry({
              id: "e1",
              kind: "purchase_grant",
              available: 60,
              purchaseId: "p1",
              at: 1,
            }),
            entry({
              id: "e2",
              kind: "reservation",
              available: -30,
              reserved: 30,
              requestId: "r1",
              bookingId: null,
              at: 2,
            }),
            entry({
              id: "e3",
              kind: "session_consumption",
              available: 0,
              reserved: -30,
              requestId: "r1",
              bookingId: "b1",
              at: 3,
            }),
          ],
        });

        expect(result.purchases[0]).toMatchObject({
          refundableMinutes: 30,
          reservedPurchasedMinutes: 0,
        });
      },
    );

    it(
      "uses purchased buckets FIFO after non-cash credit is exhausted",
      () => {
        const result =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                30,
              ),
              purchase(
                "p2",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "purchase_grant",
                available: 30,
                purchaseId:
                  "p1",
                at: 1,
              }),
              entry({
                id: "e2",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p2",
                at: 2,
              }),
              entry({
                id: "e3",
                kind:
                  "reservation",
                available: -50,
                reserved: 50,
                bookingId:
                  "b1",
                at: 3,
              }),
            ],
          });

        expect(
          result.purchases,
        ).toEqual([
          expect.objectContaining({
            purchaseId:
              "p1",
            refundableMinutes:
              0,
            reservedPurchasedMinutes:
              30,
          }),
          expect.objectContaining({
            purchaseId:
              "p2",
            refundableMinutes:
              40,
            reservedPurchasedMinutes:
              20,
          }),
        ]);
      },
    );

    it(
      "subtracts succeeded refund reversals and active refund holds from the specific purchase only",
      () => {
        const result =
          replayTutoringCreditRefundProvenance({
            purchases: [
              purchase(
                "p1",
                60,
              ),
            ],
            entries: [
              entry({
                id: "e1",
                kind:
                  "purchase_grant",
                available: 60,
                purchaseId:
                  "p1",
                at: 1,
              }),
              entry({
                id: "e2",
                kind:
                  "refund_reversal",
                available: -10,
                purchaseId:
                  "p1",
                at: 2,
              }),
            ],
            refundHolds: [
              {
                purchaseId:
                  "p1",
                minutes: 15,
                status:
                  "pending",
                stripeRefundId:
                  null,
              },
              {
                purchaseId:
                  "p1",
                minutes: 5,
                status:
                  "failed",
              },
            ],
          });

        expect(
          result.purchases[0],
        ).toMatchObject({
          availablePurchasedMinutes:
            50,
          pendingRefundMinutes:
            15,
          retryableRefundMinutes:
            15,
          refundableMinutes:
            35,
          refundableAmountMinor:
            3850,
        });
      },
    );
  },
);
