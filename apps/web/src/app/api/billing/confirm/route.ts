
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { auth } from "@/lib/auth";
import { isCheckoutSessionId } from "@/lib/billing/checkoutAttempt";
import { upsertFromStripeSubscription } from "@/lib/billing/stripeService";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function expandableId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  const record = asRecord(value);
  return typeof record?.id === "string" && record.id ? record.id : null;
}

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return NextResponse.json(
      { ok: false, message: "Forbidden." },
      { status: 403 },
    );
  }
  if (exceedsContentLength(req, 4 * 1024)) {
    return NextResponse.json(
      { ok: false, message: "Request body is too large." },
      { status: 413 },
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = asRecord(await readJsonSafe(req));
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

  // This must happen before every Stripe call and before every DB write.
  if (!isCheckoutSessionId(sessionId)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Invalid session_id. Please return from Stripe checkout again.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);

  if (checkout.mode !== "subscription") {
    return NextResponse.json(
      { ok: false, message: "Not a subscription Checkout Session." },
      { status: 400 },
    );
  }

  if (checkout.status !== "complete") {
    return NextResponse.json(
      { ok: false, message: "Checkout not complete yet." },
      { status: 409 },
    );
  }

  const metadataUserId = checkout.metadata?.userId?.trim() || null;
  const clientReferenceId = checkout.client_reference_id?.trim() || null;

  if (
    (metadataUserId && metadataUserId !== userId) ||
    (clientReferenceId && clientReferenceId !== userId)
  ) {
    return NextResponse.json(
      { ok: false, message: "Forbidden." },
      { status: 403 },
    );
  }

  // All ZoeSkoul subscription Checkout Sessions have historically carried
  // client_reference_id; newer Sessions also carry metadata.userId.
  if (!metadataUserId && !clientReferenceId) {
    return NextResponse.json(
      { ok: false, message: "Checkout ownership could not be verified." },
      { status: 403 },
    );
  }

  const subscriptionId = expandableId(checkout.subscription);
  if (!subscriptionId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Checkout session has no subscription yet.",
      },
      { status: 409 },
    );
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscriptionUserId = subscription.metadata?.userId?.trim() || null;
  if (subscriptionUserId && subscriptionUserId !== userId) {
    return NextResponse.json(
      { ok: false, message: "Forbidden." },
      { status: 403 },
    );
  }

  const checkoutCustomerId = expandableId(checkout.customer);
  const subscriptionCustomerId = expandableId(subscription.customer);
  if (
    checkoutCustomerId &&
    subscriptionCustomerId &&
    checkoutCustomerId !== subscriptionCustomerId
  ) {
    return NextResponse.json(
      { ok: false, message: "Checkout customer mismatch." },
      { status: 409 },
    );
  }

  const saved = await upsertFromStripeSubscription(
    subscription as Stripe.Subscription,
    userId,
  );
  if (!saved) {
    return NextResponse.json(
      { ok: false, message: "Could not map subscription to a user." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: saved.status,
    priceId: saved.priceId,
    currentPeriodEnd: saved.currentPeriodEnd
      ? saved.currentPeriodEnd.toISOString()
      : null,
    trialEnd: saved.trialEnd ? saved.trialEnd.toISOString() : null,
    subscriptionId: saved.subscriptionId,
  });
}
