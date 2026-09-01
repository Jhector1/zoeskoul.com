import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isTutoringCreditCheckoutEvent,
  reconcileTutoringCreditCheckoutEvent,
  type TutoringCreditWebhookDeps,
} from "./tutoringCreditWebhook";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function event(
  type:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
    | "checkout.session.async_payment_failed"
    | "checkout.session.expired",
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: `evt_${type}`,
    object: "event",
    api_version: "2026-06-30.basil",
    created: 1787958000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: {
      object: {
        id: "cs_tutor_1",
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        amount_total: 6123,
        currency: "usd",
        client_reference_id: "learner-1",
        payment_intent: "pi_tutor_1",
        metadata: {
          purchaseKind: "tutoring_credit",
          purchaseId: "purchase-1",
          userId: "learner-1",
          checkoutAttemptId: ATTEMPT_ID,
          packageMinutes: "60",
          amountMinor: "6123",
          currency: "usd",
        },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

function deps(
  overrides: Partial<TutoringCreditWebhookDeps> = {},
): TutoringCreditWebhookDeps {
  return {
    listCheckoutLineItems: vi.fn(async () => [
      { priceId: "price_tutor_60", quantity: 1 },
    ]),
    settlePaid: vi.fn(async (args) => ({
      kind: "credited" as const,
      purchaseId: args.purchaseId,
      balance: {
        availableMinutes: 60,
        reservedMinutes: 0,
        totalMinutes: 60,
      },
    })),
    markTerminal: vi.fn(async (args) => ({
      purchaseId: args.purchaseId,
      status: args.status,
    })),
    ...overrides,
  };
}

describe("tutoring Stripe webhook evidence", () => {
  it("recognizes only ZoeSkoul tutoring payment Checkout events", () => {
    expect(isTutoringCreditCheckoutEvent(event("checkout.session.completed"))).toBe(
      true,
    );
    expect(
      isTutoringCreditCheckoutEvent(
        event("checkout.session.completed", {
          mode: "subscription",
        }),
      ),
    ).toBe(false);
    expect(
      isTutoringCreditCheckoutEvent(
        event("checkout.session.completed", {
          metadata: { purchaseKind: "other" },
        }),
      ),
    ).toBe(false);
  });

  it("grants from actual Checkout amount/currency and actual line-item Price", async () => {
    const d = deps();

    const result = await reconcileTutoringCreditCheckoutEvent(
      event("checkout.session.completed"),
      { deps: d },
    );

    expect(result.kind).toBe("credited");
    expect(d.listCheckoutLineItems).toHaveBeenCalledWith("cs_tutor_1");
    expect(d.settlePaid).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaseId: "purchase-1",
        userId: "learner-1",
        checkoutAttemptId: ATTEMPT_ID,
        checkoutSessionId: "cs_tutor_1",
        paymentIntentId: "pi_tutor_1",
        packageMinutes: 60,
        amountMinor: 6123,
        currency: "usd",
        stripePriceId: "price_tutor_60",
      }),
    );
  });

  it("does not grant on Checkout completion while an async payment is pending", async () => {
    const d = deps();

    const result = await reconcileTutoringCreditCheckoutEvent(
      event("checkout.session.completed", {
        payment_status: "unpaid",
        payment_intent: null,
      }),
      { deps: d },
    );

    expect(result).toEqual({
      kind: "pending",
      purchaseId: "purchase-1",
    });
    expect(d.settlePaid).not.toHaveBeenCalled();
  });

  it("converges async payment success through the same paid-settlement owner", async () => {
    const settlePaid = vi.fn(async (args) => ({
      kind: "already_credited" as const,
      purchaseId: args.purchaseId,
      balance: {
        availableMinutes: 60,
        reservedMinutes: 0,
        totalMinutes: 60,
      },
    }));

    const result = await reconcileTutoringCreditCheckoutEvent(
      event("checkout.session.async_payment_succeeded"),
      { deps: deps({ settlePaid }) },
    );

    expect(result.kind).toBe("already_credited");
    expect(settlePaid).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered Price identity instead of granting minutes", async () => {
    const d = deps({
      listCheckoutLineItems: vi.fn(async () => [
        { priceId: null, quantity: 1 },
      ]),
    });

    await expect(
      reconcileTutoringCreditCheckoutEvent(
        event("checkout.session.completed"),
        { deps: d },
      ),
    ).rejects.toThrow(
      "Tutoring Stripe Checkout line item identity is invalid.",
    );

    expect(d.settlePaid).not.toHaveBeenCalled();
  });

  it("marks async failure and expiry terminal without granting credits", async () => {
    const d = deps();

    await expect(
      reconcileTutoringCreditCheckoutEvent(
        event("checkout.session.async_payment_failed", {
          payment_status: "unpaid",
          payment_intent: null,
        }),
        { deps: d },
      ),
    ).resolves.toEqual({
      kind: "terminal_updated",
      purchaseId: "purchase-1",
      status: "failed",
    });

    await expect(
      reconcileTutoringCreditCheckoutEvent(
        event("checkout.session.expired", {
          status: "expired",
          payment_status: "unpaid",
          payment_intent: null,
        }),
        { deps: d },
      ),
    ).resolves.toEqual({
      kind: "terminal_updated",
      purchaseId: "purchase-1",
      status: "canceled",
    });

    expect(d.settlePaid).not.toHaveBeenCalled();
    expect(d.markTerminal).toHaveBeenCalledTimes(2);
  });
});
