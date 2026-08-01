import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

import {
  extractSubscriptionIdFromInvoice,
  syncBillingStateFromStripeEvent,
} from "./stripeWebhookSync";

function asInvoice(value: Record<string, unknown>): Stripe.Invoice {
  return value as unknown as Stripe.Invoice;
}

function subscription(
  id: string,
  status: Stripe.Subscription.Status,
  userId = "user_123",
): Stripe.Subscription {
  return {
    id,
    status,
    metadata: { userId },
  } as unknown as Stripe.Subscription;
}

function event(
  type: Stripe.Event["type"],
  object: unknown,
  id = "evt_123",
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("extractSubscriptionIdFromInvoice", () => {
  it("reads the direct invoice subscription id", () => {
    expect(
      extractSubscriptionIdFromInvoice(
        asInvoice({ id: "in_1", subscription: "sub_direct" }),
      ),
    ).toBe("sub_direct");
  });

  it("reads an expanded direct invoice subscription", () => {
    expect(
      extractSubscriptionIdFromInvoice(
        asInvoice({ id: "in_1", subscription: { id: "sub_expanded" } }),
      ),
    ).toBe("sub_expanded");
  });

  it("reads newer invoice parent subscription details", () => {
    expect(
      extractSubscriptionIdFromInvoice(
        asInvoice({
          id: "in_1",
          parent: {
            subscription_details: { subscription: "sub_parent" },
          },
        }),
      ),
    ).toBe("sub_parent");
  });

  it("falls back to line parent subscription details", () => {
    expect(
      extractSubscriptionIdFromInvoice(
        asInvoice({
          id: "in_1",
          lines: {
            data: [
              {
                parent: {
                  subscription_item_details: {
                    subscription: "sub_line",
                  },
                },
              },
            ],
          },
        }),
      ),
    ).toBe("sub_line");
  });

  it("returns null for a one-time invoice", () => {
    expect(
      extractSubscriptionIdFromInvoice(
        asInvoice({ id: "in_one_time", lines: { data: [] } }),
      ),
    ).toBeNull();
  });
});

describe("syncBillingStateFromStripeEvent", () => {
  it("uses current Stripe truth for stale subscription.updated events", async () => {
    const staleEventSubscription = subscription("sub_1", "past_due");
    const currentSubscription = subscription("sub_1", "active");
    const retrieveSubscription = vi.fn().mockResolvedValue(currentSubscription);
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingStateFromStripeEvent(
      event("customer.subscription.updated", staleEventSubscription),
      { retrieveSubscription, upsertSubscription },
    );

    expect(result).toEqual({
      handled: true,
      action: "subscription_synced",
    });
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(upsertSubscription).toHaveBeenCalledWith(
      currentSubscription,
      "user_123",
    );
    expect(upsertSubscription).not.toHaveBeenCalledWith(
      staleEventSubscription,
      expect.anything(),
    );
  });

  it("syncs invoice.payment_succeeded from the current subscription", async () => {
    const currentSubscription = subscription("sub_paid", "active");
    const retrieveSubscription = vi.fn().mockResolvedValue(currentSubscription);
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingStateFromStripeEvent(
      event(
        "invoice.payment_succeeded",
        asInvoice({ id: "in_paid", subscription: "sub_paid" }),
      ),
      { retrieveSubscription, upsertSubscription },
    );

    expect(result.handled).toBe(true);
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_paid");
    expect(upsertSubscription).toHaveBeenCalledWith(
      currentSubscription,
      "user_123",
    );
  });

  it("syncs invoice.payment_failed as current past_due state", async () => {
    const currentSubscription = subscription("sub_failed", "past_due");
    const retrieveSubscription = vi.fn().mockResolvedValue(currentSubscription);
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    await syncBillingStateFromStripeEvent(
      event(
        "invoice.payment_failed",
        asInvoice({
          id: "in_failed",
          parent: {
            subscription_details: { subscription: "sub_failed" },
          },
        }),
      ),
      { retrieveSubscription, upsertSubscription },
    );

    expect(upsertSubscription).toHaveBeenCalledWith(
      currentSubscription,
      "user_123",
    );
  });

  it("uses the deleted event payload because deleted subscriptions cannot be retrieved", async () => {
    const deletedSubscription = subscription("sub_deleted", "canceled");
    const retrieveSubscription = vi.fn();
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await syncBillingStateFromStripeEvent(
      event("customer.subscription.deleted", deletedSubscription),
      { retrieveSubscription, upsertSubscription },
    );

    expect(result).toEqual({
      handled: true,
      action: "subscription_deleted",
    });
    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(upsertSubscription).toHaveBeenCalledWith(
      deletedSubscription,
      "user_123",
    );
  });

  it("logs and ignores an invoice without a subscription mapping", async () => {
    const retrieveSubscription = vi.fn();
    const upsertSubscription = vi.fn();
    const warn = vi.fn();

    const result = await syncBillingStateFromStripeEvent(
      event(
        "invoice.paid",
        asInvoice({ id: "in_one_time", lines: { data: [] } }),
      ),
      { retrieveSubscription, upsertSubscription, warn },
    );

    expect(result).toEqual({
      handled: false,
      reason: "missing_subscription_id",
    });
    expect(warn).toHaveBeenCalledWith(
      "[stripe/webhook] Invoice event has no subscription mapping",
      expect.objectContaining({
        eventType: "invoice.paid",
        invoiceId: "in_one_time",
      }),
    );
    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it("does not treat charge.succeeded as proof that a subscription invoice was paid", async () => {
    const retrieveSubscription = vi.fn();
    const upsertSubscription = vi.fn();

    const result = await syncBillingStateFromStripeEvent(
      event("charge.succeeded", { id: "ch_1", invoice: null }),
      { retrieveSubscription, upsertSubscription },
    );

    expect(result).toEqual({
      handled: false,
      reason: "unsupported_event",
    });
    expect(retrieveSubscription).not.toHaveBeenCalled();
    expect(upsertSubscription).not.toHaveBeenCalled();
  });

  it("propagates Stripe retrieval failures so the webhook returns 500 and retries", async () => {
    const retrieveSubscription = vi
      .fn()
      .mockRejectedValue(new Error("Stripe unavailable"));
    const upsertSubscription = vi.fn();

    await expect(
      syncBillingStateFromStripeEvent(
        event(
          "invoice.paid",
          asInvoice({ id: "in_1", subscription: "sub_1" }),
        ),
        { retrieveSubscription, upsertSubscription },
      ),
    ).rejects.toThrow("Stripe unavailable");

    expect(upsertSubscription).not.toHaveBeenCalled();
  });
});
