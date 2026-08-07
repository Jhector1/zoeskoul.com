import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  claimStripeEvent: vi.fn(),
  markStripeEventFailed: vi.fn(),
  markStripeEventIgnored: vi.fn(),
  markStripeEventProcessed: vi.fn(),
  stripeEventErrorText: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  extractReferences: vi.fn(() => ({
    objectId: "sub_1",
    customerId: "cus_1",
    subscriptionId: "sub_1",
  })),
  isRelevant: vi.fn(() => true),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
  }),
}));

vi.mock("@/lib/billing/stripeEventLedger", () => ({
  claimStripeEvent: mocks.claimStripeEvent,
  markStripeEventFailed: mocks.markStripeEventFailed,
  markStripeEventIgnored: mocks.markStripeEventIgnored,
  markStripeEventProcessed: mocks.markStripeEventProcessed,
  stripeEventErrorText: mocks.stripeEventErrorText,
}));

vi.mock("@/lib/billing/stripeWebhookReconciliation", () => ({
  extractStripeBillingEventReferences: mocks.extractReferences,
  isRelevantStripeBillingEventType: mocks.isRelevant,
  reconcileStripeBillingEvent: mocks.reconcile,
}));

import { POST } from "./route";

function stripeEvent(): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    api_version: null,
    created: 1,
    data: { object: { id: "sub_1" } },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type: "customer.subscription.updated",
  } as unknown as Stripe.Event;
}

function request() {
  return new Request("https://zoeskoul.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "{}",
  });
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.constructEvent.mockReturnValue(stripeEvent());
    mocks.claimStripeEvent.mockResolvedValue({
      kind: "claimed",
      recovered: false,
      attemptCount: 1,
    });
    mocks.markStripeEventFailed.mockResolvedValue(true);
    mocks.markStripeEventIgnored.mockResolvedValue(true);
    mocks.markStripeEventProcessed.mockResolvedValue(true);
    mocks.reconcile.mockResolvedValue({
      kind: "processed",
      action: "subscription_reconciled",
    });
  });

  it("returns 200 for a terminal duplicate without reconciling again", async () => {
    mocks.claimStripeEvent.mockResolvedValue({
      kind: "duplicate",
      status: "processed",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      duplicate: true,
      outcome: "processed",
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("marks successful reconciliation as processed", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.markStripeEventProcessed).toHaveBeenCalledWith("evt_1", 1);
    expect(mocks.markStripeEventFailed).not.toHaveBeenCalled();
  });

  it("marks relevant events without a subscription as ignored", async () => {
    mocks.reconcile.mockResolvedValue({
      kind: "ignored",
      reason: "missing_subscription",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.markStripeEventIgnored).toHaveBeenCalledWith(
      "evt_1",
      1,
      "missing_subscription",
    );
  });

  it("marks reconciliation failures as failed and returns 500", async () => {
    const failure = new Error("Stripe unavailable");
    mocks.reconcile.mockRejectedValue(failure);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.markStripeEventFailed).toHaveBeenCalledWith(
      "evt_1",
      1,
      failure,
    );
  });
});
