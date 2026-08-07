
import { NextResponse } from "next/server";

import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";
import { auth } from "@/lib/auth";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import {
  BILLING_CHECKOUT_SESSION_LIFETIME_MS,
  releaseBillingCheckoutReservation,
  reserveBillingCheckout,
} from "@/lib/billing/billingCheckoutReservation";
import { resolveBillingCurrency } from "@/lib/billing/currency";
import { getEntitlementForUser } from "@/lib/billing/entitlement";
import {
  billingConfig,
  createCheckoutSession,
  syncSubscriptionsForUser,
} from "@/lib/billing/stripeService";
import { prisma } from "@/lib/prisma";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { getLocaleFromCookie } from "@/serverUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHECKOUT_BODY_BYTES = 8 * 1024;

function safeInternalPath(path: unknown, fallback = "/") {
  const raw = typeof path === "string" ? path.trim() : "";
  if (!raw) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  if (exceedsContentLength(req, MAX_CHECKOUT_BODY_BYTES)) {
    return NextResponse.json(
      { message: "Request body is too large." },
      { status: 413 },
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = asRecord(await readJsonSafe(req));
  const plan = body?.plan;
  const useTrial = body?.useTrial;
  const checkoutAttemptId = body?.checkoutAttemptId;
  const callbackUrl = safeInternalPath(body?.callbackUrl, "/");

  if (plan !== "monthly" && plan !== "yearly") {
    return NextResponse.json({ message: "Invalid plan." }, { status: 400 });
  }
  if (typeof useTrial !== "boolean") {
    return NextResponse.json(
      { message: "Invalid trial selection." },
      { status: 400 },
    );
  }
  if (!isCheckoutAttemptId(checkoutAttemptId)) {
    return NextResponse.json(
      { message: "Invalid checkout attempt." },
      { status: 400 },
    );
  }

  const { monthlyPriceId, yearlyPriceId, trialDays } = billingConfig();
  const priceId = plan === "monthly" ? monthlyPriceId : yearlyPriceId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      trialUsedAt: true,
      roles: true,
    },
  });
  if (!user) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  const capabilities = resolveRoleCapabilities(user.roles);
  if (capabilities.canBypassBilling) {
    return NextResponse.json(
      {
        message: "This account already includes paid access.",
        code: "BILLING_NOT_REQUIRED",
      },
      { status: 409 },
    );
  }

  // Serialize every subscription Checkout for this user before any Stripe
  // customer/session creation. This prevents multi-tab paid and trial races.
  const reservation = await reserveBillingCheckout(
    userId,
    checkoutAttemptId,
  );

  if (reservation.kind === "conflict") {
    return NextResponse.json(
      {
        message: "A subscription checkout is already in progress.",
        code: "CHECKOUT_ALREADY_IN_PROGRESS",
      },
      { status: 409 },
    );
  }
  if (reservation.kind === "stale_attempt") {
    return NextResponse.json(
      {
        message: "This checkout attempt expired. Please start again.",
        code: "CHECKOUT_ATTEMPT_EXPIRED",
      },
      { status: 409 },
    );
  }
  if (reservation.kind === "missing_user") {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  const releaseReservation = async () => {
    await releaseBillingCheckoutReservation(
      userId,
      checkoutAttemptId,
    ).catch(() => false);
  };

  try {
    await syncSubscriptionsForUser(userId);
  } catch (error) {
    // Keep this attempt reserved. Stripe freshness failed before we can know
    // whether an earlier uncertain request created a Session or subscription.
    console.error("[/api/billing/checkout] Stripe freshness check failed", error);
    return NextResponse.json(
      {
        message: "Could not verify your current subscription. Please retry.",
        code: "BILLING_SYNC_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  const entitlement = await getEntitlementForUser(userId);
  if (entitlement.ok) {
    await releaseReservation();
    return NextResponse.json(
      {
        message: "This account already has subscription access.",
        code: "SUBSCRIPTION_ALREADY_ACTIVE",
      },
      { status: 409 },
    );
  }

  if (useTrial && (trialDays <= 0 || user.trialUsedAt)) {
    await releaseReservation();
    return NextResponse.json(
      {
        message: "The free trial is not available for this account.",
        code: "TRIAL_NOT_AVAILABLE",
      },
      { status: 409 },
    );
  }

  const appLocale = await getLocaleFromCookie();
  const billingCurrency = await resolveBillingCurrency();
  const checkoutExpiresAt = new Date(
    reservation.reservedAt.getTime() + BILLING_CHECKOUT_SESSION_LIFETIME_MS,
  );

  try {
    const out = await createCheckoutSession({
      userId,
      priceId,
      useTrial,
      callbackUrl,
      currency: billingCurrency,
      appLocale,
      checkoutAttemptId,
      checkoutExpiresAt,
    });

    if (!out.url) {
      return NextResponse.json(
        { message: "Stripe session missing url." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: out.url });
  } catch (error) {
    // Keep the reservation after an indeterminate Stripe/network failure.
    // Retrying with the same checkoutAttemptId recovers the original Session
    // or reuses Stripe's idempotent POST instead of creating a duplicate.
    console.error("[/api/billing/checkout] ERROR", error);
    return NextResponse.json(
      { message: "Checkout failed. Please retry." },
      { status: 500 },
    );
  }
}
