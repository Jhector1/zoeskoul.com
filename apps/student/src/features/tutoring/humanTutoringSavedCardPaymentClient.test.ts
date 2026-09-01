import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  startTutoringSavedCardPayment,
} from "./humanTutoringClient";

describe(
  "saved-card tutoring payment client",
  () => {
    it(
      "sends only minutes, attempt identity, and explicit saved-card consent",
      async () => {
        const fetchImpl =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  kind:
                    "saved_card_paid_pending_webhook",
                  purchaseId:
                    "purchase_1",
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

        await expect(
          startTutoringSavedCardPayment(
            {
              apiOrigin:
                "https://example.test",
              checkoutAttemptId:
                "00000000-0000-4000-8000-000000000001",
              minutes: 30,
            },
            fetchImpl as typeof fetch,
          ),
        ).resolves.toMatchObject({
          kind:
            "saved_card_paid_pending_webhook",
        });

        const init =
          fetchImpl.mock
            .calls[0]?.[1];

        expect(
          JSON.parse(
            String(
              init?.body,
            ),
          ),
        ).toEqual({
          checkoutAttemptId:
            "00000000-0000-4000-8000-000000000001",
          minutes: 30,
          confirmReuse: true,
        });
      },
    );
  },
);
