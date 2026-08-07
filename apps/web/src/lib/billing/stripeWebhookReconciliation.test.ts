import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  RELEVANT_STRIPE_BILLING_EVENT_TYPES,
  extractStripeBillingEventReferences,
  extractSubscriptionIdFromInvoiceObject,
  isRelevantStripeBillingEventType,
  reconcileStripeBillingEvent,
  type StripeWebhookReconciliationDeps,
} from "./stripeWebhookReconciliation";

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    api_version: null,
    created: 1,
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  } as unknown as Stripe.Event;
}

function subscription(
  status: Stripe.Subscription.Status,
): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status,
    customer: "cus_1",
    metadata: { userId: "user_1" },
    items: { data: [] },
  } as unknown as Stripe.Subscription;
}

function deps(
  overrides: Partial<StripeWebhookReconciliationDeps> = {},
): StripeWebhookReconciliationDeps {
  return {
    retrieveSubscription: vi.fn(async () => subscription("active")),
    upsertSubscription: vi.fn(async () => ({ subscriptionId: "sub_1" })),
    cancelDeletedCustomer: vi.fn(async () => ({ users: 1, subscriptions: 1 })),
    ...overrides,
  };
}

describe("Stripe billing event classification", () => {
  it("classifies every supported billing event as relevant", () => {
    for (const type of RELEVANT_STRIPE_BILLING_EVENT_TYPES) {
      expect(isRelevantStripeBillingEventType(type), type).toBe(true);
    }
  });

  it("rejects unrelated events", () => {
    expect(isRelevantStripeBillingEventType("payment_intent.created")).toBe(false);
  });
});

describe("Stripe event reference extraction", () => {
  it("extracts direct and nested invoice subscription references", () => {
    expect(extractSubscriptionIdFromInvoiceObject({ subscription: "sub_direct" })).toBe(
      "sub_direct",
    );
    expect(
      extractSubscriptionIdFromInvoiceObject({
        parent: { subscription_details: { subscription: { id: "sub_parent" } } },
      }),
    ).toBe("sub_parent");
    expect(
      extractSubscriptionIdFromInvoiceObject({
        lines: {
          data: [
            {
              parent: {
                subscription_item_details: { subscription: "sub_item" },
              },
            },
          ],
        },
      }),
    ).toBe("sub_item");
    expect(
      extractSubscriptionIdFromInvoiceObject({
        lines: {
          data: [
            {
              parent: {
                invoice_item_details: { subscription: { id: "sub_invoice_item" } },
              },
            },
          ],
        },
      }),
    ).toBe("sub_invoice_item");
  });

  it("extracts Checkout subscription IDs from strings and expanded objects", () => {
    expect(
      extractStripeBillingEventReferences(
        event("checkout.session.completed", {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_1",
        }),
      ),
    ).toEqual({ objectId: "cs_1", customerId: "cus_1", subscriptionId: "sub_1" });

    expect(
      extractStripeBillingEventReferences(
        event("checkout.session.completed", {
          id: "cs_2",
          customer: { id: "cus_2" },
          subscription: { id: "sub_2" },
        }),
      ),
    ).toEqual({ objectId: "cs_2", customerId: "cus_2", subscriptionId: "sub_2" });
  });

  it("extracts subscription and deleted-customer references", () => {
    expect(
      extractStripeBillingEventReferences(
        event("customer.subscription.updated", {
          id: "sub_1",
          customer: "cus_1",
        }),
      ),
    ).toEqual({ objectId: "sub_1", customerId: "cus_1", subscriptionId: "sub_1" });

    expect(
      extractStripeBillingEventReferences(
        event("customer.deleted", { id: "cus_deleted", deleted: true }),
      ),
    ).toEqual({
      objectId: "cus_deleted",
      customerId: "cus_deleted",
      subscriptionId: null,
    });
  });
});

describe("Stripe current-state reconciliation", () => {
  it("uses the current Stripe subscription instead of a late trialing snapshot", async () => {
    const current = subscription("active");
    const retrieveSubscription = vi.fn(async () => current);
    const upsertSubscription = vi.fn(async () => ({ subscriptionId: current.id }));
    const services = deps({ retrieveSubscription, upsertSubscription });

    const result = await reconcileStripeBillingEvent(
      event("customer.subscription.updated", subscription("trialing") as unknown as Record<string, unknown>),
      services,
    );

    expect(result).toEqual({ kind: "processed", action: "subscription_reconciled" });
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(upsertSubscription).toHaveBeenCalledWith(current, "user_1");
  });

  it("falls back to a deleted subscription snapshot only when Stripe says it is missing", async () => {
    const deleted = subscription("canceled");
    const retrieveSubscription = vi.fn(async () => {
      throw Object.assign(new Error("No such subscription"), {
        code: "resource_missing",
      });
    });
    const upsertSubscription = vi.fn(async () => ({ subscriptionId: deleted.id }));

    await expect(
      reconcileStripeBillingEvent(
        event(
          "customer.subscription.deleted",
          deleted as unknown as Record<string, unknown>,
        ),
        deps({ retrieveSubscription, upsertSubscription }),
      ),
    ).resolves.toEqual({ kind: "processed", action: "subscription_reconciled" });

    expect(upsertSubscription).toHaveBeenCalledWith(deleted, null);
  });

  it("marks subscription events without a local user as ignored", async () => {
    const services = deps({ upsertSubscription: vi.fn(async () => null) });

    await expect(
      reconcileStripeBillingEvent(
        event(
          "customer.subscription.updated",
          subscription("active") as unknown as Record<string, unknown>,
        ),
        services,
      ),
    ).resolves.toEqual({ kind: "ignored", reason: "unmapped_subscription" });
  });

  it("cancels local state for customer.deleted", async () => {
    const cancelDeletedCustomer = vi.fn(async () => ({ users: 1, subscriptions: 2 }));

    await expect(
      reconcileStripeBillingEvent(
        event("customer.deleted", { id: "cus_1", deleted: true }),
        deps({ cancelDeletedCustomer }),
      ),
    ).resolves.toEqual({ kind: "processed", action: "customer_deleted" });

    expect(cancelDeletedCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("records relevant events without subscription references as ignored", async () => {
    await expect(
      reconcileStripeBillingEvent(
        event("invoice.payment_failed", { id: "in_1", customer: "cus_1" }),
        deps(),
      ),
    ).resolves.toEqual({ kind: "ignored", reason: "missing_subscription" });
  });
});
