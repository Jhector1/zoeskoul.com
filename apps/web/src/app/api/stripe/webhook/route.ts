// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { upsertFromStripeSubscription } from "@/lib/billing/stripeService";
import { syncBillingStateFromStripeEvent } from "@/lib/billing/stripeWebhookSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { message: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ message: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    return NextResponse.json(
      { message: `Webhook error: ${err?.message ?? "Invalid signature"}` },
      { status: 400 },
    );
  }

  try {
    await syncBillingStateFromStripeEvent(event, {
      retrieveSubscription: async (subscriptionId) =>
        stripe.subscriptions.retrieve(subscriptionId),
      upsertSubscription: upsertFromStripeSubscription,
      warn: (message, details) => console.warn(message, details),
    });
  } catch (e: any) {
    // Returning 500 tells Stripe to retry transient retrieval or persistence failures.
    return NextResponse.json(
      { message: e?.message ?? "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
