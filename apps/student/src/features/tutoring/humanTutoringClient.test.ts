import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createHumanTutoringRequest,
  loadHumanTutoringOverview,
  startTutoringCreditCheckout,
} from "./humanTutoringClient";

function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

describe(
  "human tutoring browser client",
  () => {
    it("loads server pricing, credits, and preferred request times", async () => {
      const fetchImpl =
        vi.fn<typeof fetch>(
          async (input) => {
            const url =
              String(input);

            if (
              url.endsWith(
                "/api/tutoring/credits",
              )
            ) {
              return json({
                balance: {
                  availableMinutes:
                    300,
                  reservedMinutes:
                    60,
                  totalMinutes:
                    360,
                },
                purchasePackages: [
                  {
                    minutes: 30,
                    amountMinor:
                      3300,
                    currency:
                      "usd",
                  },
                  {
                    minutes: 60,
                    amountMinor:
                      6600,
                    currency:
                      "usd",
                  },
                  {
                    minutes: 120,
                    amountMinor:
                      13200,
                    currency:
                      "usd",
                  },
                ],
                sessionDurations: [
                  30,
                  60,
                ],
                pricing: {
                  minimumMinutes:
                    30,
                  incrementMinutes:
                    1,
                  maximumMinutes:
                    720,
                  rateMinorPerMinute:
                    110,
                  currency:
                    "usd",
                  pricingVersion:
                    "flat-usd-110-per-minute-v1",
                },
              });
            }

            return json({
              requests: [
                {
                  id:
                    "request-1",
                  tutoringSessionId:
                    null,
                  status:
                    "requested",
                  requestedMinutes:
                    240,
                  preferredStartsAt:
                    "2026-09-01T15:00:00.000Z",
                  sourceSubjectSlug:
                    "python",
                  sourceModuleSlug:
                    null,
                  sourceExerciseKey:
                    null,
                  note:
                    "Project help",
                  scheduledAt:
                    null,
                  completedAt:
                    null,
                  canceledAt:
                    null,
                  createdAt:
                    "2026-08-29T00:00:00.000Z",
                  updatedAt:
                    "2026-08-29T00:00:00.000Z",
                },
              ],
            });
          },
        );

      const result =
        await loadHumanTutoringOverview(
          "https://zoeskoul.com",
          fetchImpl,
        );

      expect(
        result.credits.pricing
          .rateMinorPerMinute,
      ).toBe(110);
      expect(
        result.requests[0]
          ?.requestedMinutes,
      ).toBe(240);
      expect(
        result.requests[0]
          ?.preferredStartsAt,
      ).toBe(
        "2026-09-01T15:00:00.000Z",
      );

      for (
        const call
        of fetchImpl.mock.calls
      ) {
        expect(
          call[1],
        ).toMatchObject({
          credentials:
            "include",
          cache:
            "no-store",
        });
      }
    });

    it("starts arbitrary valid-minute checkout without browser money", async () => {
      const fetchImpl =
        vi.fn<typeof fetch>(
          async () =>
            json({
              kind:
                "checkout",
              purchaseId:
                "purchase-1",
              checkoutSessionId:
                "cs_test_1",
              url:
                "https://checkout.stripe.com/example",
              resumed:
                false,
            }),
        );

      await startTutoringCreditCheckout(
        {
          apiOrigin:
            "https://zoeskoul.com",
          checkoutAttemptId:
            "11111111-1111-4111-8111-111111111111",
          minutes: 240,
          locale: "en",
        },
        fetchImpl,
      );

      const [, init] =
        fetchImpl.mock.calls[0]!;
      const body =
        JSON.parse(
          String(
            init?.body,
          ),
        );

      expect(
        body.minutes,
      ).toBe(240);
      expect(
        body,
      ).not.toHaveProperty(
        "amountMinor",
      );
      expect(
        body,
      ).not.toHaveProperty(
        "price",
      );
    });

    it("submits preferred time and custom duration but never tutor identity", async () => {
      const fetchImpl =
        vi.fn<typeof fetch>(
          async () =>
            json(
              {
                request: {
                  id:
                    "request-1",
                  tutoringSessionId:
                    null,
                  status:
                    "requested",
                  requestedMinutes:
                    240,
                  preferredStartsAt:
                    "2026-09-01T15:00:00.000Z",
                  sourceSubjectSlug:
                    "python",
                  sourceModuleSlug:
                    null,
                  sourceExerciseKey:
                    null,
                  note:
                    "Project help",
                  scheduledAt:
                    null,
                  completedAt:
                    null,
                  canceledAt:
                    null,
                  createdAt:
                    "2026-08-29T00:00:00.000Z",
                  updatedAt:
                    "2026-08-29T00:00:00.000Z",
                },
                balance: {
                  availableMinutes:
                    300,
                  reservedMinutes:
                    0,
                  totalMinutes:
                    300,
                },
                resumed:
                  false,
              },
              201,
            ),
        );

      await createHumanTutoringRequest(
        {
          apiOrigin:
            "https://zoeskoul.com",
          requestAttemptId:
            "22222222-2222-4222-8222-222222222222",
          requestedMinutes:
            240,
          preferredStartsAt:
            "2026-09-01T15:00:00.000Z",
          sourceSubjectSlug:
            "python",
          note:
            "Project help",
        },
        fetchImpl,
      );

      const [, init] =
        fetchImpl.mock.calls[0]!;
      const body =
        JSON.parse(
          String(
            init?.body,
          ),
        );

      expect(
        body,
      ).toMatchObject({
        requestedMinutes:
          240,
        preferredStartsAt:
          "2026-09-01T15:00:00.000Z",
        sourceSubjectSlug:
          "python",
      });
      expect(
        body,
      ).not.toHaveProperty(
        "teacherId",
      );
      expect(
        body,
      ).not.toHaveProperty(
        "scheduledAt",
      );
    });
  },
);
