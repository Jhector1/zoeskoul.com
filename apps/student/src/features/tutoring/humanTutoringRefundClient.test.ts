import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  loadTutoringRefundableCredits,
  requestTutoringCreditRefund,
} from "./humanTutoringClient";

describe(
  "student tutoring refund client",
  () => {
    it(
      "loads refundability from the read-only learner endpoint",
      async () => {
        const fetchImpl =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  refundable: {
                    nonCashAvailableMinutes:
                      0,
                    nonCashReservedMinutes:
                      0,
                    purchases:
                      [],
                    totalRefundableMinutes:
                      60,
                  },
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              ),
          );

        await loadTutoringRefundableCredits(
          "https://example.test",
          fetchImpl as typeof fetch,
        );

        expect(
          fetchImpl,
        ).toHaveBeenCalledWith(
          "https://example.test/api/tutoring/credits/refundable",
          expect.objectContaining({
            method: "GET",
            credentials:
              "include",
          }),
        );
      },
    );

    it(
      "requests a refund with attempt, purchase, and minutes only",
      async () => {
        const fetchImpl =
          vi.fn(
            async (
              _url,
              init,
            ) => {
              const body =
                JSON.parse(
                  String(
                    init?.body,
                  ),
                );

              expect(body)
                .toEqual({
                  refundAttemptId:
                    "11111111-1111-4111-8111-111111111111",
                  purchaseId:
                    "purchase-1",
                  minutes:
                    40,
                });

              expect(body)
                .not.toHaveProperty(
                  "amountMinor",
                );

              return new Response(
                JSON.stringify({
                  kind:
                    "refund_pending",
                  refundId:
                    "refund-1",
                  status:
                    "pending",
                  minutes:
                    40,
                  amountMinor:
                    4400,
                  currency:
                    "usd",
                }),
                {
                  status: 202,
                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                },
              );
            },
          );

        await requestTutoringCreditRefund(
          {
            apiOrigin:
              "https://example.test",
            refundAttemptId:
              "11111111-1111-4111-8111-111111111111",
            purchaseId:
              "purchase-1",
            minutes:
              40,
          },
          fetchImpl as typeof fetch,
        );
      },
    );
  },
);
