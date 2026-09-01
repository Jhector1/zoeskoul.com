import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  authorizeTutoringSavedPaymentMethod,
  loadTutoringSavedPaymentMethod,
} from "./humanTutoringClient";

describe(
  "human tutoring saved payment client",
  () => {
    it(
      "loads a masked saved payment method",
      async () => {
        const saved = {
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2028,
          allowRedisplay:
            "limited" as const,
        };

        const fetchImpl = vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                paymentMethod: saved,
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
          loadTutoringSavedPaymentMethod(
            "https://example.test",
            fetchImpl as typeof fetch,
          ),
        ).resolves.toEqual(saved);

        expect(
          fetchImpl,
        ).toHaveBeenCalledWith(
          "https://example.test/api/tutoring/payment-method",
          expect.objectContaining({
            method: "GET",
            credentials: "include",
          }),
        );
      },
    );

    it(
      "sends explicit reuse consent before saved-card checkout",
      async () => {
        const fetchImpl = vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                paymentMethod: {
                  brand: "visa",
                  last4: "4242",
                  expMonth: 12,
                  expYear: 2028,
                  allowRedisplay:
                    "always",
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

        await expect(
          authorizeTutoringSavedPaymentMethod(
            "https://example.test",
            fetchImpl as typeof fetch,
          ),
        ).resolves.toMatchObject({
          last4: "4242",
          allowRedisplay:
            "always",
        });

        const init =
          fetchImpl.mock
            .calls[0]?.[1];

        expect(
          init,
        ).toEqual(
          expect.objectContaining({
            method: "POST",
            credentials: "include",
          }),
        );

        expect(
          JSON.parse(
            String(init?.body),
          ),
        ).toEqual({
          confirmReuse: true,
        });
      },
    );
  },
);
