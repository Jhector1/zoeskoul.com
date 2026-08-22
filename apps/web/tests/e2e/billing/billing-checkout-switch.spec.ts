import crypto from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  billingUserRow,
  checkoutSessionDetails,
  checkoutSessionsForAttempt,
  expireCheckoutViaCli,
  resetBillingUser,
  stripeEventRowsSince,
} from "./state";

type AppResponse = { status: number; body: Record<string, unknown> | null };
const origin = process.env.E2E_BILLING_ORIGIN ?? "http://localhost:3000";
const newAttemptId = () => crypto.randomUUID();

async function openBilling(page: Page) {
  await page.goto(`${origin}/en/billing`);
  await expect(page).toHaveURL(/\/en\/billing(?:[/?#]|$)/, { timeout: 30_000 });
}

async function appPost(page: Page, path: string, body: Record<string, unknown>): Promise<AppResponse> {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, body });
}

async function checkout(page: Page, args: { attemptId: string; plan: "monthly" | "yearly"; useTrial: boolean }) {
  return appPost(page, "/api/billing/checkout", { plan: args.plan, useTrial: args.useTrial, callbackUrl: "/en/billing", checkoutAttemptId: args.attemptId });
}

function checkoutUrl(result: AppResponse) {
  const url = result.body?.url;
  if (typeof url !== "string") throw new Error(`Expected Checkout URL, got ${JSON.stringify(result.body)}`);
  return url;
}

async function onlyAttemptSession(attemptId: string) {
  const sessions = await checkoutSessionsForAttempt(attemptId);
  expect(sessions).toHaveLength(1);
  return sessions[0]!;
}

function firstLineItemPriceId(session: Awaited<ReturnType<typeof checkoutSessionDetails>>) {
  return session.line_items?.data?.[0]?.price?.id ?? null;
}

async function expireIfOpen(attemptId: string) {
  for (const session of await checkoutSessionsForAttempt(attemptId)) {
    if (session.status === "open") expireCheckoutViaCli(session.id);
  }
}

test.describe.serial("ZoeSkoul real Stripe Checkout plan switching", () => {
  test.beforeEach(async () => { await resetBillingUser(); });
  test.afterEach(async () => { await resetBillingUser(); });

  test("same Monthly intent resumes the one real open Stripe Checkout", async ({ page }) => {
    await openBilling(page);
    const firstAttempt = newAttemptId();
    const secondAttempt = newAttemptId();
    const first = await checkout(page, { attemptId: firstAttempt, plan: "monthly", useTrial: false });
    expect(first.status).toBe(200);
    const resumed = await checkout(page, { attemptId: secondAttempt, plan: "monthly", useTrial: false });
    expect(resumed.status).toBe(200);
    expect(resumed.body?.resumed).toBe(true);
    expect(checkoutUrl(resumed)).toBe(checkoutUrl(first));
    expect((await onlyAttemptSession(firstAttempt)).status).toBe("open");
    expect(await checkoutSessionsForAttempt(secondAttempt)).toHaveLength(0);
    expect((await billingUserRow()).billingCheckoutAttemptId).toBe(firstAttempt);
    await expireIfOpen(firstAttempt);
  });

  test("Monthly to Yearly expires the real Monthly session and creates one Yearly session", async ({ page }) => {
    await openBilling(page);
    const monthlyAttempt = newAttemptId();
    const yearlyAttempt = newAttemptId();
    const monthly = await checkout(page, { attemptId: monthlyAttempt, plan: "monthly", useTrial: false });
    expect(monthly.status).toBe(200);
    const oldSession = await onlyAttemptSession(monthlyAttempt);
    const switchStartedAt = new Date();
    const yearly = await checkout(page, { attemptId: yearlyAttempt, plan: "yearly", useTrial: false });
    expect(yearly.status).toBe(200);
    expect(yearly.body?.resumed).not.toBe(true);
    expect(checkoutUrl(yearly)).not.toBe(checkoutUrl(monthly));
    await expect.poll(async () => (await checkoutSessionDetails(oldSession.id)).status, { timeout: 30_000 }).toBe("expired");
    const detailed = await checkoutSessionDetails((await onlyAttemptSession(yearlyAttempt)).id);
    expect(detailed.status).toBe("open");
    expect(detailed.metadata?.priceId).toBe(process.env.STRIPE_PRICE_YEARLY_ID);
    expect(detailed.metadata?.useTrial).toBe("false");
    expect(firstLineItemPriceId(detailed)).toBe(process.env.STRIPE_PRICE_YEARLY_ID);

    // Prove the real signed expiration webhook was durably processed and that
    // its exact-attempt cleanup cannot erase the newer Yearly reservation.
    await expect.poll(async () => {
      const rows = await stripeEventRowsSince("checkout.session.expired", switchStartedAt);
      return rows.some((row) => row.objectId === oldSession.id && (row.status === "processed" || row.status === "ignored"));
    }, { timeout: 45_000 }).toBe(true);
    expect((await billingUserRow()).billingCheckoutAttemptId).toBe(yearlyAttempt);
    await expireIfOpen(yearlyAttempt);
  });

  test("Yearly to Monthly performs the reverse real Stripe switch", async ({ page }) => {
    await openBilling(page);
    const yearlyAttempt = newAttemptId();
    const monthlyAttempt = newAttemptId();
    expect((await checkout(page, { attemptId: yearlyAttempt, plan: "yearly", useTrial: false })).status).toBe(200);
    const oldSession = await onlyAttemptSession(yearlyAttempt);
    expect((await checkout(page, { attemptId: monthlyAttempt, plan: "monthly", useTrial: false })).status).toBe(200);
    await expect.poll(async () => (await checkoutSessionDetails(oldSession.id)).status, { timeout: 30_000 }).toBe("expired");
    const detailed = await checkoutSessionDetails((await onlyAttemptSession(monthlyAttempt)).id);
    expect(detailed.status).toBe("open");
    expect(detailed.metadata?.priceId).toBe(process.env.STRIPE_PRICE_MONTHLY_ID);
    expect(firstLineItemPriceId(detailed)).toBe(process.env.STRIPE_PRICE_MONTHLY_ID);
    await expireIfOpen(monthlyAttempt);
  });

  test("paid to trial is a real intent switch even on the same interval", async ({ page }) => {
    await openBilling(page);
    const paidAttempt = newAttemptId();
    const trialAttempt = newAttemptId();
    expect((await checkout(page, { attemptId: paidAttempt, plan: "monthly", useTrial: false })).status).toBe(200);
    const oldSession = await onlyAttemptSession(paidAttempt);
    expect((await checkout(page, { attemptId: trialAttempt, plan: "monthly", useTrial: true })).status).toBe(200);
    await expect.poll(async () => (await checkoutSessionDetails(oldSession.id)).status, { timeout: 30_000 }).toBe("expired");
    const detailed = await checkoutSessionDetails((await onlyAttemptSession(trialAttempt)).id);
    expect(detailed.metadata?.useTrial).toBe("true");
    expect(detailed.metadata?.priceId).toBe(process.env.STRIPE_PRICE_MONTHLY_ID);
    await expireIfOpen(trialAttempt);
  });

  test("external Stripe expiration plus signed webhook releases reservation and next click creates fresh", async ({ page }) => {
    await openBilling(page);
    const expiredAttempt = newAttemptId();
    const freshAttempt = newAttemptId();
    const first = await checkout(page, { attemptId: expiredAttempt, plan: "monthly", useTrial: false });
    expect(first.status).toBe(200);
    const oldSession = await onlyAttemptSession(expiredAttempt);
    expireCheckoutViaCli(oldSession.id);
    await expect.poll(async () => (await billingUserRow()).billingCheckoutAttemptId, { timeout: 45_000 }).toBeNull();
    const fresh = await checkout(page, { attemptId: freshAttempt, plan: "yearly", useTrial: false });
    expect(fresh.status).toBe(200);
    expect(fresh.body?.resumed).not.toBe(true);
    expect(checkoutUrl(fresh)).not.toBe(checkoutUrl(first));
    expect((await onlyAttemptSession(freshAttempt)).status).toBe("open");
    await expireIfOpen(freshAttempt);
  });

  test("old cancel cleanup cannot clear the newer reservation after a real plan switch", async ({ page }) => {
    await openBilling(page);
    const oldAttempt = newAttemptId();
    const newAttempt = newAttemptId();
    expect((await checkout(page, { attemptId: oldAttempt, plan: "monthly", useTrial: false })).status).toBe(200);
    expect((await checkout(page, { attemptId: newAttempt, plan: "yearly", useTrial: false })).status).toBe(200);
    const staleRelease = await appPost(page, "/api/billing/checkout/release", { checkoutAttemptId: oldAttempt });
    expect(staleRelease.status).toBe(200);
    expect(staleRelease.body?.released).toBe(false);
    expect((await billingUserRow()).billingCheckoutAttemptId).toBe(newAttempt);
    expect((await onlyAttemptSession(newAttempt)).status).toBe("open");
    await expireIfOpen(newAttempt);
  });
});
