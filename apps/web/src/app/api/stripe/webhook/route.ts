import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { processPlatformBillingWebhook } from "@zoeskoul/platform-server/billing/platformWebhookDelivery";
import { checkPlatformStripeEventEnvironment } from "@zoeskoul/platform-server/billing/platformStripeEventEnvironment";

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

  // Signature-valid events must also belong to this platform Stripe mode.
  // Reject BEFORE ledger claims or any grant/subscription mutations.
  const mode = checkPlatformStripeEventEnvironment({
    secretKey: process.env.LEARNOIR_STRIPE_SECRET_KEY,
    event,
  });
  if (mode !== "accepted") {
    return NextResponse.json(
      { message: mode === "unconfigured"
        ? "Platform Stripe mode unavailable"
        : "Stripe event is not valid for this platform billing environment" },
      { status: mode === "unconfigured" ? 503 : 400 },
    );
  }

  const result = await processPlatformBillingWebhook({
    event,
    relevant: isRelevantStripeBillingEventType,
    references: extractStripeBillingEventReferences,
    claim: claimStripeEvent,
    reconcile: reconcileStripeBillingEvent,
    markIgnored: markStripeEventIgnored,
    markProcessed: markStripeEventProcessed,
    markFailed: markStripeEventFailed,
    reportError: (stage, error) => {
      console.error(
        stage === "mark_failed"
          ? "[stripe-webhook] failed to record event failure"
          : "[stripe-webhook] event processing failed",
        stripeEventErrorText(error),
      );
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}
