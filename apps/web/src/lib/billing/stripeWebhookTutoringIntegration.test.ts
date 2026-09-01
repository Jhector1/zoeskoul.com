import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  isTutoringCreditCheckoutEvent: vi.fn(),
  reconcileTutoringCreditCheckoutEvent: vi.fn(),
  isTutoringCreditPaymentIntentEvent: vi.fn(),
  reconcileTutoringCreditPaymentIntentEvent: vi.fn(),
  isTutoringCreditRefundEvent: vi.fn(),
  reconcileTutoringCreditRefundEvent: vi.fn(),
}));

vi.mock("@/lib/tutoring/tutoringCreditWebhook", () => ({
  isTutoringCreditCheckoutEvent: mocks.isTutoringCreditCheckoutEvent,
  reconcileTutoringCreditCheckoutEvent:
    mocks.reconcileTutoringCreditCheckoutEvent,
  isTutoringCreditPaymentIntentEvent:
    mocks.isTutoringCreditPaymentIntentEvent,
  reconcileTutoringCreditPaymentIntentEvent:
    mocks.reconcileTutoringCreditPaymentIntentEvent,
}));

vi.mock("@/lib/tutoring/tutoringCreditRefundWebhook", () => ({
  isTutoringCreditRefundEvent:
    mocks.isTutoringCreditRefundEvent,
  reconcileTutoringCreditRefundEvent:
    mocks.reconcileTutoringCreditRefundEvent,
}));

import { reconcileStripeBillingEvent } from "./stripeWebhookReconciliation";

function event(
  type: string,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id: "evt_tutor_1",
    object: "event",
    api_version: "2026-06-30.basil",
    created: 1787958000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("Stripe billing reconciliation tutoring dispatch", () => {
  beforeEach(() => {
    mocks.isTutoringCreditCheckoutEvent.mockReset();
    mocks.reconcileTutoringCreditCheckoutEvent.mockReset();
    mocks.isTutoringCreditPaymentIntentEvent.mockReset();
    mocks.reconcileTutoringCreditPaymentIntentEvent.mockReset();
    mocks.isTutoringCreditRefundEvent.mockReset();
    mocks.reconcileTutoringCreditRefundEvent.mockReset();
  });

  it("dispatches tutoring payment Checkout through the tutoring reconciler", async () => {
    const evt = event("checkout.session.completed", {
      id: "cs_tutor_1",
      object: "checkout.session",
      mode: "payment",
      metadata: { purchaseKind: "tutoring_credit" },
    });

    mocks.isTutoringCreditCheckoutEvent.mockReturnValue(true);
    mocks.reconcileTutoringCreditCheckoutEvent.mockResolvedValue({
      kind: "credited",
      purchaseId: "purchase-1",
      settlement: {
        kind: "credited",
        purchaseId: "purchase-1",
        balance: {
          availableMinutes: 60,
          reservedMinutes: 0,
          totalMinutes: 60,
        },
      },
    });

    await expect(reconcileStripeBillingEvent(evt)).resolves.toEqual({
      kind: "processed",
      action: "tutoring_credit_reconciled",
    });

    expect(
      mocks.reconcileTutoringCreditCheckoutEvent,
    ).toHaveBeenCalledWith(evt);
  });

  it("marks tutoring async failure/expiry as processed terminal state", async () => {
    const evt = event("checkout.session.expired", {
      id: "cs_tutor_1",
      object: "checkout.session",
      mode: "payment",
      metadata: { purchaseKind: "tutoring_credit" },
    });

    mocks.isTutoringCreditCheckoutEvent.mockReturnValue(true);
    mocks.reconcileTutoringCreditCheckoutEvent.mockResolvedValue({
      kind: "terminal_updated",
      purchaseId: "purchase-1",
      status: "canceled",
    });

    await expect(reconcileStripeBillingEvent(evt)).resolves.toEqual({
      kind: "processed",
      action: "tutoring_credit_terminal_updated",
    });
  });

  it("dispatches direct tutoring saved-card PaymentIntent through the tutoring reconciler", async () => {
    const evt = event("payment_intent.succeeded", {
      id: "pi_tutor_saved_1",
      object: "payment_intent",
      status: "succeeded",
      metadata: {
        purchaseKind: "tutoring_credit",
        paymentChannel: "saved_card",
      },
    });

    mocks.isTutoringCreditPaymentIntentEvent.mockReturnValue(true);
    mocks.reconcileTutoringCreditPaymentIntentEvent.mockResolvedValue({
      kind: "credited",
      purchaseId: "purchase-1",
      settlement: {
        kind: "credited",
        purchaseId: "purchase-1",
        balance: {
          availableMinutes: 30,
          reservedMinutes: 0,
          totalMinutes: 30,
        },
      },
    });

    await expect(
      reconcileStripeBillingEvent(evt),
    ).resolves.toEqual({
      kind: "processed",
      action: "tutoring_credit_reconciled",
    });

    expect(
      mocks.reconcileTutoringCreditPaymentIntentEvent,
    ).toHaveBeenCalledWith(evt);
  });

  it("dispatches tutoring Refund events through the tutoring refund reconciler", async () => {
    const evt = event("refund.updated", {
      id: "re_tutor_1",
      object: "refund",
      status: "succeeded",
      metadata: {
        refundKind: "tutoring_credit",
      },
    });

    mocks.isTutoringCreditRefundEvent.mockReturnValue(true);
    mocks.reconcileTutoringCreditRefundEvent.mockResolvedValue({
      kind: "refunded",
      refundId: "refund-1",
    });

    await expect(
      reconcileStripeBillingEvent(evt),
    ).resolves.toEqual({
      kind: "processed",
      action: "tutoring_credit_refund_reconciled",
    });

    expect(
      mocks.reconcileTutoringCreditRefundEvent,
    ).toHaveBeenCalledWith(evt);
  });

  it("leaves subscription Checkout on the existing billing path", async () => {
    const evt = event("checkout.session.completed", {
      id: "cs_subscription_1",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_1",
      subscription: "sub_1",
      metadata: {
        userId: "user_1",
        checkoutAttemptId: "11111111-1111-4111-8111-111111111111",
      },
    });

    mocks.isTutoringCreditCheckoutEvent.mockReturnValue(false);

    const deps = {
      retrieveSubscription: vi.fn(async () => ({
        id: "sub_1",
        object: "subscription",
        status: "active",
        customer: "cus_1",
        metadata: { userId: "user_1" },
        items: { data: [] },
      } as unknown as Stripe.Subscription)),
      upsertSubscription: vi.fn(async () => ({ subscriptionId: "sub_1" })),
      releaseBillingCheckoutReservation: vi.fn(async () => true),
      cancelDeletedCustomer: vi.fn(async () => ({
        users: 0,
        subscriptions: 0,
      })),
    };

    await reconcileStripeBillingEvent(evt, deps);

    expect(
      mocks.reconcileTutoringCreditCheckoutEvent,
    ).not.toHaveBeenCalled();
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_1");
  });
});
