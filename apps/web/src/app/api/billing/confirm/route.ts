// src/app/api/billing/confirm/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { upsertFromStripeSubscription } from "@/lib/billing/stripeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { sessionId?: string } | null;
  const sessionId = body?.sessionId?.trim();

  if (!sessionId) {
    return NextResponse.json({ ok: false, message: "Missing sessionId" }, { status: 400 });
  }

  const cs = await stripe.checkout.sessions.retrieve(sessionId);

  if (cs.mode !== "subscription") {
    return NextResponse.json({ ok: false, message: "Not a subscription Checkout Session." }, { status: 400 });
  }

  // Optional safety: require checkout session complete
  if ((cs as any).status && (cs as any).status !== "complete") {
    return NextResponse.json({ ok: false, message: "Checkout not complete yet." }, { status: 409 });
  }

  const metaUserId = (cs.metadata?.userId ?? null) as string | null;
  if (metaUserId && metaUserId !== userId) {
    return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
  }

  const subId =
      typeof cs.subscription === "string" ? cs.subscription : (cs.subscription as any)?.id ?? null;

  if (!subId) {
    return NextResponse.json({ ok: false, message: "Checkout session has no subscription yet." }, { status: 409 });
  }

  const sub = await stripe.subscriptions.retrieve(subId);

  const saved = await upsertFromStripeSubscription(sub as Stripe.Subscription, userId);
  if (!saved) {
    return NextResponse.json({ ok: false, message: "Could not map subscription to a user." }, { status: 404 });
  }
  const bad =
      !sessionId ||
      sessionId === "{CHECKOUT_SESSION_ID}" ||
      sessionId.includes("CHECKOUT_SESSION_ID") ||
      !/^cs_(test|live)_/.test(sessionId);

  if (bad) {
    return NextResponse.json(
        { ok: false, message: "Invalid session_id. Please return from Stripe checkout again." },
        { status: 400 },
    );
  }

  // ✅ don’t return customerId to client (not needed)
  return NextResponse.json({
    ok: true,
    status: saved.status,
    priceId: saved.priceId,
    currentPeriodEnd: saved.currentPeriodEnd ? saved.currentPeriodEnd.toISOString() : null,
    trialEnd: saved.trialEnd ? saved.trialEnd.toISOString() : null,
    subscriptionId: saved.subscriptionId,
  });
}