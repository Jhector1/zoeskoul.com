import "server-only";

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { upsertFromStripeSubscription } from "@/lib/billing/stripeService";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { releaseBillingCheckoutReservation } from "@/lib/billing/billingCheckoutReservation";

export const RELEVANT_STRIPE_BILLING_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.created",
  "invoice.finalized",
  "invoice.finalization_failed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "customer.deleted",
] as const;

const RELEVANT_EVENT_TYPE_SET = new Set<string>(
  RELEVANT_STRIPE_BILLING_EVENT_TYPES,
);

export type StripeBillingEventReferences = {
  objectId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
};

export type StripeWebhookReconciliationResult =
  | {
      kind: "processed";
      action:
        | "subscription_reconciled"
        | "customer_deleted"
        | "checkout_released";
    }
  | { kind: "ignored"; reason: string };

export type StripeWebhookReconciliationDeps = {
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  upsertSubscription(
    subscription: Stripe.Subscription,
    hintedUserId?: string | null,
  ): Promise<unknown | null>;
  releaseBillingCheckoutReservation(
    userId: string,
    checkoutAttemptId: string,
  ): Promise<boolean>;
  cancelDeletedCustomer(customerId: string): Promise<{
    users: number;
    subscriptions: number;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function expandableId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  const record = asRecord(value);
  return typeof record?.id === "string" && record.id ? record.id : null;
}

function metadataUserId(value: unknown): string | null {
  const metadata = asRecord(asRecord(value)?.metadata);
  return typeof metadata?.userId === "string" && metadata.userId
    ? metadata.userId
    : null;
}

function invoiceLines(value: unknown): unknown[] {
  const lines = asRecord(asRecord(value)?.lines);
  return Array.isArray(lines?.data) ? lines.data : [];
}

export function extractSubscriptionIdFromInvoiceObject(
  value: unknown,
): string | null {
  const invoice = asRecord(value);
  if (!invoice) return null;

  const direct = expandableId(invoice.subscription);
  if (direct) return direct;

  const parent = asRecord(invoice.parent);
  const subscriptionDetails = asRecord(parent?.subscription_details);
  const parentSubscription = expandableId(subscriptionDetails?.subscription);
  if (parentSubscription) return parentSubscription;

  for (const lineValue of invoiceLines(invoice)) {
    const line = asRecord(lineValue);
    const lineParent = asRecord(line?.parent);

    const subscriptionItemDetails = asRecord(
      lineParent?.subscription_item_details,
    );
    const subscriptionItemId = expandableId(
      subscriptionItemDetails?.subscription,
    );
    if (subscriptionItemId) return subscriptionItemId;

    const invoiceItemDetails = asRecord(lineParent?.invoice_item_details);
    const invoiceItemId = expandableId(invoiceItemDetails?.subscription);
    if (invoiceItemId) return invoiceItemId;
  }

  return null;
}

function eventObject(event: Stripe.Event): Record<string, unknown> | null {
  return asRecord(event.data.object);
}

function isCheckoutEvent(type: string): boolean {
  return type.startsWith("checkout.session.");
}

function isSubscriptionEvent(type: string): boolean {
  return type.startsWith("customer.subscription.");
}

function isInvoiceEvent(type: string): boolean {
  return type.startsWith("invoice.");
}

export function isRelevantStripeBillingEventType(type: string): boolean {
  return RELEVANT_EVENT_TYPE_SET.has(type);
}

export function extractStripeBillingEventReferences(
  event: Stripe.Event,
): StripeBillingEventReferences {
  const object = eventObject(event);
  const objectId = expandableId(object?.id);

  if (event.type === "customer.deleted") {
    return {
      objectId,
      customerId: objectId,
      subscriptionId: null,
    };
  }

  const customerId = expandableId(object?.customer);

  if (isSubscriptionEvent(event.type)) {
    return { objectId, customerId, subscriptionId: objectId };
  }

  if (isCheckoutEvent(event.type)) {
    return {
      objectId,
      customerId,
      subscriptionId: expandableId(object?.subscription),
    };
  }

  if (isInvoiceEvent(event.type)) {
    return {
      objectId,
      customerId,
      subscriptionId: extractSubscriptionIdFromInvoiceObject(object),
    };
  }

  return { objectId, customerId, subscriptionId: null };
}

function isStripeResourceMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "resource_missing" ||
    (typeof record.message === "string" &&
      record.message.includes("No such subscription"))
  );
}

async function defaultCancelDeletedCustomer(customerId: string) {
  const [users, subscriptions] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: { stripeCustomerId: null },
    }),
    prisma.subscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        status: "canceled",
        currentPeriodEnd: new Date(0),
        trialEnd: null,
        cancelAtPeriodEnd: false,
      },
    }),
  ]);

  return { users: users.count, subscriptions: subscriptions.count };
}

const defaultDeps: StripeWebhookReconciliationDeps = {
  retrieveSubscription: async (subscriptionId) =>
    getStripe().subscriptions.retrieve(subscriptionId),
  upsertSubscription: upsertFromStripeSubscription,
  releaseBillingCheckoutReservation,
  cancelDeletedCustomer: defaultCancelDeletedCustomer,
};

async function reconcileCurrentSubscription(args: {
  subscriptionId: string;
  hintedUserId: string | null;
  fallbackDeletedSnapshot?: Stripe.Subscription;
  deps: StripeWebhookReconciliationDeps;
}): Promise<StripeWebhookReconciliationResult> {
  let subscription: Stripe.Subscription;
  let usedDeletedSnapshotFallback = false;

  try {
    subscription = await args.deps.retrieveSubscription(args.subscriptionId);
  } catch (error: unknown) {
    if (args.fallbackDeletedSnapshot && isStripeResourceMissingError(error)) {
      subscription = args.fallbackDeletedSnapshot;
      usedDeletedSnapshotFallback = true;
    } else {
      throw error;
    }
  }

  // If the Stripe customer was already deleted, do not use metadata to
  // reattach that deleted customer ID to a local user through the fallback.
  const hintedUserId = usedDeletedSnapshotFallback
    ? null
    : args.hintedUserId ?? metadataUserId(subscription);
  const saved = await args.deps.upsertSubscription(subscription, hintedUserId);

  return saved
    ? { kind: "processed", action: "subscription_reconciled" }
    : { kind: "ignored", reason: "unmapped_subscription" };
}

export async function reconcileStripeBillingEvent(
  event: Stripe.Event,
  deps: StripeWebhookReconciliationDeps = defaultDeps,
): Promise<StripeWebhookReconciliationResult> {
  if (!isRelevantStripeBillingEventType(event.type)) {
    return { kind: "ignored", reason: "unrelated_event" };
  }

  const object = eventObject(event);
  const references = extractStripeBillingEventReferences(event);

  if (event.type === "customer.deleted") {
    if (!references.customerId) {
      return { kind: "ignored", reason: "missing_customer" };
    }

    const canceled = await deps.cancelDeletedCustomer(references.customerId);
    return canceled.users > 0 || canceled.subscriptions > 0
      ? { kind: "processed", action: "customer_deleted" }
      : { kind: "ignored", reason: "unmapped_customer" };
  }

  if (
    event.type === "checkout.session.expired" &&
    object?.mode === "subscription"
  ) {
    const metadata = asRecord(object.metadata);
    const userId = metadataUserId(object);
    const checkoutAttemptId = metadata?.checkoutAttemptId;

    if (!userId || !isCheckoutAttemptId(checkoutAttemptId)) {
      return {
        kind: "ignored",
        reason: "missing_checkout_reservation_reference",
      };
    }

    const released = await deps.releaseBillingCheckoutReservation(
      userId,
      checkoutAttemptId,
    );

    return released
      ? { kind: "processed", action: "checkout_released" }
      : {
          kind: "ignored",
          reason: "checkout_reservation_missing",
        };
  }

  if (isCheckoutEvent(event.type)) {
    if (object?.mode !== "subscription") {
      return { kind: "ignored", reason: "non_subscription_checkout" };
    }
    if (!references.subscriptionId) {
      return { kind: "ignored", reason: "missing_subscription" };
    }

    return reconcileCurrentSubscription({
      subscriptionId: references.subscriptionId,
      hintedUserId: metadataUserId(object),
      deps,
    });
  }

  if (isInvoiceEvent(event.type)) {
    if (!references.subscriptionId) {
      return { kind: "ignored", reason: "missing_subscription" };
    }

    return reconcileCurrentSubscription({
      subscriptionId: references.subscriptionId,
      hintedUserId: null,
      deps,
    });
  }

  if (isSubscriptionEvent(event.type)) {
    if (!references.subscriptionId || !object) {
      return { kind: "ignored", reason: "missing_subscription" };
    }

    const snapshot = event.data.object as Stripe.Subscription;
    return reconcileCurrentSubscription({
      subscriptionId: references.subscriptionId,
      hintedUserId: metadataUserId(object),
      fallbackDeletedSnapshot:
        event.type === "customer.subscription.deleted" ? snapshot : undefined,
      deps,
    });
  }

  return { kind: "ignored", reason: "unsupported_relevant_event" };
}
