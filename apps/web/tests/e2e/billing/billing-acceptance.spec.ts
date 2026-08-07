import crypto from "node:crypto";

import {
  expect,
  test,
  type Page,
} from "@playwright/test";

import {
  billingUserRow,
  cancelRealStripeSubscription,
  checkoutSessionsForAttempt,
  createRealStripeSubscriptionForAttempt,
  expireCheckoutViaCli,
  preserveTrialButRemoveSubscription,
  resetBillingUser,
  stripeEventRowsSince,
  subscriptionRows,
  touchRealStripeSubscription,
  triggerStripeEventViaCli,
} from "./state";

type AppResponse = {
  status: number;
  body: Record<string, unknown> | null;
};

const origin =
  process.env.E2E_BILLING_ORIGIN ??
  "http://localhost:3000";

function newAttemptId() {
  return crypto.randomUUID();
}

async function openBilling(page: Page) {
  await page.goto(`${origin}/en/billing`);
  await expect(
    page.getByRole("button", {
      name: "Subscribe monthly",
    }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

async function appPost(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<AppResponse> {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(body),
      });

      const parsed =
        await response.json().catch(() => null);

      return {
        status: response.status,
        body:
          parsed &&
          typeof parsed === "object"
            ? parsed
            : null,
      };
    },
    { path, body },
  );
}

async function checkout(
  page: Page,
  args: {
    attemptId: string;
    useTrial: boolean;
    plan?: "monthly" | "yearly";
  },
) {
  return appPost(
    page,
    "/api/billing/checkout",
    {
      plan: args.plan ?? "monthly",
      useTrial: args.useTrial,
      callbackUrl: "/en/billing",
      checkoutAttemptId: args.attemptId,
    },
  );
}

function checkoutUrl(
  response: AppResponse,
) {
  const value = response.body?.url;
  expect(typeof value).toBe("string");
  return String(value);
}

async function release(
  page: Page,
  attemptId: string,
) {
  return appPost(
    page,
    "/api/billing/checkout/release",
    {
      checkoutAttemptId: attemptId,
    },
  );
}

async function expireOpenAttempt(
  attemptId: string,
) {
  const sessions =
    await checkoutSessionsForAttempt(attemptId);

  for (const session of sessions) {
    if (session.status === "open") {
      try {
        expireCheckoutViaCli(session.id);
      } catch {
        // Cleanup is best-effort.
      }
    }
  }
}

test.describe.serial(
  "ZoeSkoul Stripe subscription acceptance",
  () => {
    test.beforeEach(async () => {
      await resetBillingUser();
    });

    test.afterEach(async () => {
      await resetBillingUser();
    });

    test(
      "new paid Checkout and same-attempt retry produce one Stripe Session",
      async ({ page }) => {
        await openBilling(page);

        const attemptId = newAttemptId();

        const first = await checkout(page, {
          attemptId,
          useTrial: false,
        });
        expect(first.status).toBe(200);

        const retry = await checkout(page, {
          attemptId,
          useTrial: false,
        });
        expect(retry.status).toBe(200);
        expect(checkoutUrl(retry)).toBe(
          checkoutUrl(first),
        );

        await expect
          .poll(
            async () =>
              (
                await checkoutSessionsForAttempt(
                  attemptId,
                )
              ).length,
            {
              timeout: 20_000,
            },
          )
          .toBe(1);

        const [session] =
          await checkoutSessionsForAttempt(
            attemptId,
          );

        expect(session.mode).toBe(
          "subscription",
        );
        expect(
          session.metadata?.useTrial,
        ).toBe("false");

        const user = await billingUserRow();
        expect(
          user.billingCheckoutAttemptId,
        ).toBe(attemptId);

        await release(page, attemptId);
        await expireOpenAttempt(attemptId);
      },
    );

    test(
      "rapid duplicate UI click sends one Checkout request",
      async ({ page }) => {
        await openBilling(page);

        let requests = 0;

        await page.route(
          "**/api/billing/checkout",
          async (route) => {
            requests += 1;
            await new Promise((resolve) =>
              setTimeout(resolve, 500),
            );
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                message:
                  "Synthetic duplicate-click hold",
              }),
            });
          },
        );

        const button =
          page.getByRole("button", {
            name: "Subscribe monthly",
          });

        await button.evaluate((element) => {
          element.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
            }),
          );
          element.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
            }),
          );
        });

        await expect
          .poll(() => requests, {
            timeout: 5_000,
          })
          .toBe(1);

        await page.waitForTimeout(700);
        expect(requests).toBe(1);
      },
    );

    test(
      "two tabs with different attempts serialize to one Checkout",
      async ({ browser }) => {
        const context =
          await browser.newContext({
            storageState:
              process.env
                .E2E_BILLING_STORAGE_STATE,
          });

        const pageA =
          await context.newPage();
        const pageB =
          await context.newPage();

        try {
          await Promise.all([
            openBilling(pageA),
            openBilling(pageB),
          ]);

          const attemptA =
            newAttemptId();
          const attemptB =
            newAttemptId();

          const [a, b] =
            await Promise.all([
              checkout(pageA, {
                attemptId: attemptA,
                useTrial: false,
              }),
              checkout(pageB, {
                attemptId: attemptB,
                useTrial: false,
              }),
            ]);

          const statuses =
            [a.status, b.status].sort(
              (x, y) => x - y,
            );
          expect(statuses).toEqual(
            [200, 409],
          );

          const rejected =
            a.status === 409 ? a : b;
          expect(
            rejected.body?.code,
          ).toBe(
            "CHECKOUT_ALREADY_IN_PROGRESS",
          );

          await expect
            .poll(
              async () => {
                const sessions = [
                  ...(
                    await checkoutSessionsForAttempt(
                      attemptA,
                    )
                  ),
                  ...(
                    await checkoutSessionsForAttempt(
                      attemptB,
                    )
                  ),
                ];
                return sessions.length;
              },
              {
                timeout: 20_000,
              },
            )
            .toBe(1);

          const user =
            await billingUserRow();
          const winner =
            user.billingCheckoutAttemptId;

          expect(
            [attemptA, attemptB],
          ).toContain(winner);

          if (winner) {
            await release(
              pageA,
              winner,
            );
            await expireOpenAttempt(
              winner,
            );
          }
        } finally {
          await context.close();
        }
      },
    );

    test(
      "cancel return releases only the matching reservation",
      async ({ page }) => {
        await openBilling(page);
        const attemptId =
          newAttemptId();

        const response =
          await checkout(page, {
            attemptId,
            useTrial: false,
          });
        expect(response.status).toBe(200);

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              )
                .billingCheckoutAttemptId,
          )
          .toBe(attemptId);

        await page.goto(
          `${origin}/en/billing` +
            `?canceled=1` +
            `&checkout_attempt_id=${encodeURIComponent(
              attemptId,
            )}`,
        );

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              )
                .billingCheckoutAttemptId,
            {
              timeout: 15_000,
            },
          )
          .toBeNull();

        await expireOpenAttempt(attemptId);
      },
    );

    test(
      "Stripe CLI expiration sends a signed webhook and releases the reservation",
      async ({ page }) => {
        await openBilling(page);
        const attemptId =
          newAttemptId();

        const response =
          await checkout(page, {
            attemptId,
            useTrial: false,
          });
        expect(response.status).toBe(200);

        const [session] =
          await checkoutSessionsForAttempt(
            attemptId,
          );
        expect(session?.status).toBe("open");

        expireCheckoutViaCli(session.id);

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              )
                .billingCheckoutAttemptId,
            {
              timeout: 30_000,
            },
          )
          .toBeNull();

        await expect
          .poll(
            async () => {
              const rows =
                await stripeEventRowsSince(
                  "checkout.session.expired",
                  new Date(
                    Date.now() -
                      60_000,
                  ),
                );
              return rows.some(
                (row) =>
                  row.objectId ===
                    session.id &&
                  (
                    row.status ===
                      "processed" ||
                    row.status ===
                      "ignored"
                  ),
              );
            },
            {
              timeout: 30_000,
            },
          )
          .toBe(true);
      },
    );

    test(
      "Stripe CLI trigger reaches the signed durable webhook ledger",
      async () => {
        const startedAt =
          new Date();

        triggerStripeEventViaCli(
          "invoice.payment_failed",
        );

        await expect
          .poll(
            async () => {
              const rows =
                await stripeEventRowsSince(
                  "invoice.payment_failed",
                  startedAt,
                );

              return rows.some(
                (row) =>
                  row.status ===
                    "processed" ||
                  row.status ===
                    "ignored",
              );
            },
            {
              timeout: 45_000,
            },
          )
          .toBe(true);
      },
    );

    test(
      "real trial subscription reconciles through signed Stripe webhook and second trial is rejected",
      async ({ page }) => {
        await openBilling(page);
        const attemptId =
          newAttemptId();

        const response =
          await checkout(page, {
            attemptId,
            useTrial: true,
          });
        expect(response.status).toBe(200);

        const created =
          await createRealStripeSubscriptionForAttempt({
            checkoutAttemptId:
              attemptId,
            useTrial: true,
          });

        expect(created.status).toBe(
          "trialing",
        );
        expect(
          created.metadata
            .checkoutAttemptId,
        ).toBe(attemptId);

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              ).trialUsedAt !== null,
            {
              timeout: 45_000,
            },
          )
          .toBe(true);

        await expect
          .poll(
            async () => {
              const rows =
                await subscriptionRows();

              return rows.length === 1
                ? {
                    id:
                      rows[0]
                        ?.stripeSubscriptionId,
                    status:
                      rows[0]?.status,
                  }
                : null;
            },
            {
              timeout: 45_000,
            },
          )
          .toEqual({
            id: created.id,
            status: "trialing",
          });

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              )
                .billingCheckoutAttemptId,
            {
              timeout: 45_000,
            },
          )
          .toBeNull();

        await expect
          .poll(
            async () => {
              const rows =
                await stripeEventRowsSince(
                  "customer.subscription.created",
                  new Date(
                    Date.now() -
                      60_000,
                  ),
                );

              return rows.some(
                (row) =>
                  row.objectId ===
                    created.id &&
                  (
                    row.status ===
                      "processed" ||
                    row.status ===
                      "ignored"
                  ),
              );
            },
            {
              timeout: 45_000,
            },
          )
          .toBe(true);

        await cancelRealStripeSubscription(
          created.id,
        );

        await expect
          .poll(
            async () => {
              const rows =
                await subscriptionRows();
              return rows.length === 1
                ? rows[0]?.status
                : null;
            },
            {
              timeout: 45_000,
            },
          )
          .toBe("canceled");

        await preserveTrialButRemoveSubscription();

        await page.goto(
          `${origin}/en/billing`,
        );

        const secondAttempt =
          newAttemptId();
        const second =
          await checkout(page, {
            attemptId:
              secondAttempt,
            useTrial: true,
          });

        expect(second.status).toBe(
          409,
        );
        expect(
          second.body?.code,
        ).toBe("TRIAL_NOT_AVAILABLE");

        expect(
          await checkoutSessionsForAttempt(
            secondAttempt,
          ),
        ).toHaveLength(0);
      },
    );

    test(
      "real paid subscription reconciles once and repeated Stripe update stays idempotent",
      async ({ page }) => {
        await openBilling(page);
        const attemptId =
          newAttemptId();

        const response =
          await checkout(page, {
            attemptId,
            useTrial: false,
          });
        expect(response.status).toBe(200);

        const created =
          await createRealStripeSubscriptionForAttempt({
            checkoutAttemptId:
              attemptId,
            useTrial: false,
          });

        expect(created.id).toMatch(
          /^sub_/,
        );

        await expect
          .poll(
            async () => {
              const rows =
                await subscriptionRows();

              return rows.length === 1
                ? {
                    id:
                      rows[0]
                        ?.stripeSubscriptionId,
                    status:
                      rows[0]?.status,
                  }
                : null;
            },
            {
              timeout: 60_000,
            },
          )
          .toEqual({
            id: created.id,
            status: "active",
          });

        await expect
          .poll(
            async () =>
              (
                await billingUserRow()
              )
                .billingCheckoutAttemptId,
            {
              timeout: 45_000,
            },
          )
          .toBeNull();

        const before =
          await subscriptionRows();
        expect(before).toHaveLength(1);

        const replayStartedAt =
          new Date();

        await touchRealStripeSubscription(
          created.id,
        );

        await expect
          .poll(
            async () => {
              const rows =
                await stripeEventRowsSince(
                  "customer.subscription.updated",
                  replayStartedAt,
                );

              return rows.some(
                (row) =>
                  row.objectId ===
                    created.id &&
                  (
                    row.status ===
                      "processed" ||
                    row.status ===
                      "ignored"
                  ),
              );
            },
            {
              timeout: 45_000,
            },
          )
          .toBe(true);

        const after =
          await subscriptionRows();

        expect(after).toHaveLength(1);
        expect(
          after[0]
            ?.stripeSubscriptionId,
        ).toBe(created.id);

        await cancelRealStripeSubscription(
          created.id,
        );

        await expect
          .poll(
            async () => {
              const rows =
                await subscriptionRows();
              return rows.length === 1
                ? rows[0]?.status
                : null;
            },
            {
              timeout: 45_000,
            },
          )
          .toBe("canceled");
      },
    );
  },
);
