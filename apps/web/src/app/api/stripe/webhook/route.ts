// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { upsertFromStripeSubscription } from "@/lib/billing/stripeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractSubscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  // Stripe types can lag behind API surface across versions.
  // Use a safe "any" view for fields that may not be present in typings.
  const x = inv as any;

  // ✅ Newer invoices: invoice.parent.subscription_details.subscription :contentReference[oaicite:1]{index=1}
  const pSub = x?.parent?.subscription_details?.subscription;
  if (typeof pSub === "string") return pSub;
  if (pSub && typeof pSub === "object" && typeof pSub.id === "string") return pSub.id;

  // Fallback: sometimes the subscription is reachable via line parent details :contentReference[oaicite:2]{index=2}
  const lines: any[] = x?.lines?.data ?? [];
  for (const line of lines) {
    const s1 = line?.parent?.subscription_item_details?.subscription;
    if (typeof s1 === "string") return s1;
    if (s1 && typeof s1 === "object" && typeof s1.id === "string") return s1.id;

    const s2 = line?.parent?.invoice_item_details?.subscription;
    if (typeof s2 === "string") return s2;
    if (s2 && typeof s2 === "object" && typeof s2.id === "string") return s2.id;
  }

  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
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
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.mode !== "subscription") break;

        const subId =
            typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id ?? null;

        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);

        const hintedUserId =
            (cs.metadata?.userId as string | undefined) ??
            (sub.metadata?.userId as string | undefined) ??
            null;

        await upsertFromStripeSubscription(sub, hintedUserId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const hintedUserId = (sub.metadata?.userId as string | undefined) ?? null;
        await upsertFromStripeSubscription(sub, hintedUserId);
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;

        // ✅ NEW: extract via invoice.parent / lines (no inv.subscription)
        const subId = extractSubscriptionIdFromInvoice(inv);
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const hintedUserId = (sub.metadata?.userId as string | undefined) ?? null;

        await upsertFromStripeSubscription(sub, hintedUserId);
        break;
      }

      default:
        break;
    }
  } catch (e: any) {
    // Returning 500 tells Stripe to retry
    return NextResponse.json({ message: e?.message ?? "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}