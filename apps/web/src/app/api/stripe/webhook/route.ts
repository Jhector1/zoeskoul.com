import { NextResponse } from "next/server";
import type Stripe from "stripe";

import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventIgnored,
  markStripeEventProcessed,
  stripeEventErrorText,
} from "@/lib/billing/stripeEventLedger";
import {
  extractStripeBillingEventReferences,
  isRelevantStripeBillingEventType,
  reconcileStripeBillingEvent,
} from "@/lib/billing/stripeWebhookReconciliation";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { message: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ message: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error: unknown) {
    return NextResponse.json(
      { message: `Webhook error: ${errorMessage(error, "Invalid signature")}` },
      { status: 400 },
    );
  }

  if (!isRelevantStripeBillingEventType(event.type)) {
    return NextResponse.json({ received: true, outcome: "unrelated" });
  }

  const references = extractStripeBillingEventReferences(event);
  let claimAttemptCount: number | null = null;

  try {
    const claim = await claimStripeEvent({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      created: event.created,
      ...references,
    });

    if (claim.kind === "duplicate") {
      return NextResponse.json({
        received: true,
        duplicate: true,
        outcome: claim.status,
      });
    }

    if (claim.kind === "in_progress") {
      return NextResponse.json(
        { received: false, outcome: "processing" },
        { status: 409 },
      );
    }

    claimAttemptCount = claim.attemptCount;
    const result = await reconcileStripeBillingEvent(event);

    if (result.kind === "ignored") {
      const marked = await markStripeEventIgnored(
        event.id,
        claim.attemptCount,
        result.reason,
      );
      if (!marked) {
        throw new Error("Stripe event could not be marked ignored");
      }
      return NextResponse.json({ received: true, outcome: "ignored" });
    }

    const marked = await markStripeEventProcessed(
      event.id,
      claim.attemptCount,
    );
    if (!marked) {
      throw new Error("Stripe event could not be marked processed");
    }

    return NextResponse.json({ received: true, outcome: "processed" });
  } catch (error: unknown) {
    if (claimAttemptCount !== null) {
      try {
        await markStripeEventFailed(
          event.id,
          claimAttemptCount,
          error,
        );
      } catch (markError: unknown) {
        console.error(
          "[stripe-webhook] failed to record event failure",
          stripeEventErrorText(markError),
        );
      }
    }

    console.error(
      "[stripe-webhook] event processing failed",
      stripeEventErrorText(error),
    );

    return NextResponse.json(
      { message: "Webhook handler failed", outcome: "failed" },
      { status: 500 },
    );
  }
}
