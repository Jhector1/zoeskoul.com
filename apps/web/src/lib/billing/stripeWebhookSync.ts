import type Stripe from "stripe";

export type StripeWebhookSyncResult =
  | { handled: true; action: "subscription_synced" | "subscription_deleted" }
  | {
      handled: false;
      reason:
        | "unsupported_event"
        | "non_subscription_checkout"
        | "missing_subscription_id";
    };

type StripeWebhookSyncDependencies = {
  retrieveSubscription: (
    subscriptionId: string,
  ) => Promise<Stripe.Subscription>;
  upsertSubscription: (
    subscription: Stripe.Subscription,
    hintedUserId?: string | null,
  ) => Promise<unknown>;
  warn?: (message: string, details: Record<string, unknown>) => void;
};

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

export function extractSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | null {
  // Stripe's invoice shape differs across API versions. Check the direct
  // field first, then newer parent details, then line-item parent details.
  const raw = invoice as unknown as {
    subscription?: unknown;
    parent?: {
      subscription_details?: { subscription?: unknown };
    };
    lines?: {
      data?: Array<{
        parent?: {
          subscription_item_details?: { subscription?: unknown };
          invoice_item_details?: { subscription?: unknown };
        };
      }>;
    };
  };

  const direct = objectId(raw.subscription);
  if (direct) return direct;

  const parentSubscription = objectId(
    raw.parent?.subscription_details?.subscription,
  );
  if (parentSubscription) return parentSubscription;

  const lines = Array.isArray(raw.lines?.data) ? raw.lines.data : [];
  for (const line of lines) {
    const subscriptionItemSubscription = objectId(
      line?.parent?.subscription_item_details?.subscription,
    );
    if (subscriptionItemSubscription) return subscriptionItemSubscription;

    const invoiceItemSubscription = objectId(
      line?.parent?.invoice_item_details?.subscription,
    );
    if (invoiceItemSubscription) return invoiceItemSubscription;
  }

  return null;
}

function hintedUserIdFromSubscription(
  subscription: Stripe.Subscription,
): string | null {
  const value = subscription.metadata?.userId;
  return typeof value === "string" && value.trim() ? value : null;
}

async function retrieveAndUpsertSubscription(
  subscriptionId: string,
  dependencies: StripeWebhookSyncDependencies,
  fallbackHintedUserId: string | null = null,
): Promise<void> {
  const currentSubscription =
    await dependencies.retrieveSubscription(subscriptionId);

  await dependencies.upsertSubscription(
    currentSubscription,
    hintedUserIdFromSubscription(currentSubscription) ?? fallbackHintedUserId,
  );
}

export async function syncBillingStateFromStripeEvent(
  event: Stripe.Event,
  dependencies: StripeWebhookSyncDependencies,
): Promise<StripeWebhookSyncResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      if (checkoutSession.mode !== "subscription") {
        return { handled: false, reason: "non_subscription_checkout" };
      }

      const subscriptionId = objectId(checkoutSession.subscription);
      if (!subscriptionId) {
        dependencies.warn?.(
          "[stripe/webhook] Subscription checkout has no subscription id",
          {
            eventId: event.id,
            eventType: event.type,
            checkoutSessionId: checkoutSession.id,
          },
        );
        return { handled: false, reason: "missing_subscription_id" };
      }

      const checkoutHintedUserId = checkoutSession.metadata?.userId;
      await retrieveAndUpsertSubscription(
        subscriptionId,
        dependencies,
        typeof checkoutHintedUserId === "string" ? checkoutHintedUserId : null,
      );
      return { handled: true, action: "subscription_synced" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const eventSubscription = event.data.object as Stripe.Subscription;

      // Stripe doesn't guarantee event delivery order. Retrieve the current
      // object so an older past_due event cannot overwrite a newer active state.
      await retrieveAndUpsertSubscription(
        eventSubscription.id,
        dependencies,
        hintedUserIdFromSubscription(eventSubscription),
      );
      return { handled: true, action: "subscription_synced" };
    }

    case "customer.subscription.deleted": {
      const deletedSubscription = event.data.object as Stripe.Subscription;
      await dependencies.upsertSubscription(
        deletedSubscription,
        hintedUserIdFromSubscription(deletedSubscription),
      );
      return { handled: true, action: "subscription_deleted" };
    }

    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = extractSubscriptionIdFromInvoice(invoice);

      if (!subscriptionId) {
        // One-time invoices legitimately have no subscription. Log the event so
        // subscription invoice mapping problems are visible without retrying forever.
        dependencies.warn?.(
          "[stripe/webhook] Invoice event has no subscription mapping",
          {
            eventId: event.id,
            eventType: event.type,
            invoiceId: invoice.id,
          },
        );
        return { handled: false, reason: "missing_subscription_id" };
      }

      await retrieveAndUpsertSubscription(subscriptionId, dependencies);
      return { handled: true, action: "subscription_synced" };
    }

    default:
      return { handled: false, reason: "unsupported_event" };
  }
}
