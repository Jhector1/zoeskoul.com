
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
import { getActiveBillingPromotionForPlan } from "@/lib/billing/promotion.server";
import { getEntitlementForUser } from "@/lib/billing/entitlement";
import {
  billingConfig,
  classifyCheckoutSessionIntent,
  createCheckoutSession,
  expireOpenCheckoutSession,
  findExistingCheckoutSessionForAttempt,
  isDeterministicStripeCheckoutRequestError,
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
const BILLING_CHECKOUT_CONFLICT_RECOVERY_GRACE_MS = 5 * 60 * 1000;

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

  if (useTrial && (trialDays <= 0 || user.trialUsedAt)) {
    return NextResponse.json(
      {
        message: "The free trial is not available for this account.",
        code: "TRIAL_NOT_AVAILABLE",
      },
      { status: 409 },
    );
  }

  // Serialize every subscription Checkout for this user before any Stripe
  // customer/session creation. This prevents multi-tab paid and trial races.
  let reservation = await reserveBillingCheckout(
    userId,
    checkoutAttemptId,
  );

  const reserveAfterRetiringAttempt = async (oldAttemptId: string) => {
    // The signed checkout.session.expired webhook may already have released the
    // exact old attempt. Always let the new atomic reserve decide what exists.
    await releaseBillingCheckoutReservation(userId, oldAttemptId).catch(() => false);
    reservation = await reserveBillingCheckout(userId, checkoutAttemptId);
  };

  const recoveryUnavailable = () =>
    NextResponse.json(
      {
        message: "Could not safely update the existing checkout. Please retry.",
        code: "CHECKOUT_RECOVERY_UNAVAILABLE",
      },
      { status: 503 },
    );

  const completedCheckoutResponse = () =>
    NextResponse.json(
      {
        message: "Your checkout completed. We are confirming your subscription.",
        code: "CHECKOUT_COMPLETED_RECONCILING",
      },
      { status: 409 },
    );

  if (reservation.kind === "conflict" && isCheckoutAttemptId(reservation.checkoutAttemptId)) {
    const oldAttemptId = reservation.checkoutAttemptId;
    const conflictAgeMs = Math.max(0, Date.now() - reservation.reservedAt.getTime());

    try {
      const existingSession = await findExistingCheckoutSessionForAttempt({
        userId,
        checkoutAttemptId: oldAttemptId,
      });

      if (existingSession?.status === "complete") {
        // A completed Checkout can already own a subscription. Never replace it.
        return completedCheckoutResponse();
      }

      if (existingSession?.status === "open") {
        const intent = classifyCheckoutSessionIntent({
          session: existingSession,
          priceId,
          useTrial,
        });

        if (intent === "match") {
          if (typeof existingSession.url === "string" && existingSession.url) {
            return NextResponse.json({ url: existingSession.url, resumed: true });
          }
          return recoveryUnavailable();
        }

        if (intent === "unknown") {
          // Do not guess plan/trial identity for a live Checkout.
          return recoveryUnavailable();
        }

        const expired = await expireOpenCheckoutSession(existingSession.id);
        if (expired.status !== "expired") return recoveryUnavailable();
        await reserveAfterRetiringAttempt(oldAttemptId);
      } else if (existingSession?.status === "expired") {
        await reserveAfterRetiringAttempt(oldAttemptId);
      } else if (!existingSession && conflictAgeMs >= BILLING_CHECKOUT_CONFLICT_RECOVERY_GRACE_MS) {
        // Preserve the established orphan grace for a Stripe lookup with no row.
        await reserveAfterRetiringAttempt(oldAttemptId);
      }
    } catch (error) {
      console.error("[/api/billing/checkout] conflict recovery verification failed", error);
      return recoveryUnavailable();
    }
  }

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
    try {
      const existingSession = await findExistingCheckoutSessionForAttempt({
        userId,
        checkoutAttemptId,
      });
      if (existingSession?.status === "complete") return completedCheckoutResponse();
      if (existingSession?.status === "open") {
        const expired = await expireOpenCheckoutSession(existingSession.id);
        if (expired.status !== "expired") return recoveryUnavailable();
      }
      await releaseBillingCheckoutReservation(userId, checkoutAttemptId).catch(() => false);
      return NextResponse.json(
        {
          message: "This checkout attempt expired. Starting a fresh checkout.",
          code: "CHECKOUT_ATTEMPT_EXPIRED",
          retryable: true,
        },
        { status: 409 },
      );
    } catch (error) {
      console.error("[/api/billing/checkout] stale attempt recovery failed", error);
      return recoveryUnavailable();
    }
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

  const promotion = await getActiveBillingPromotionForPlan(plan);

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
      promotion,
    });

    if (!out.url) {
      return NextResponse.json(
        { message: "Stripe session missing url." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: out.url });
  } catch (error) {
    if (isDeterministicStripeCheckoutRequestError(error)) {
      // Stripe rejected the request before creating a Checkout Session.
      // This outcome is determinate, so keeping the durable reservation would
      // incorrectly block the learner's next corrected attempt.
      await releaseReservation();
      console.error("[/api/billing/checkout] Stripe request rejected", error);
      return NextResponse.json(
        {
          message: "Checkout configuration was rejected. Please retry.",
          code: "CHECKOUT_REQUEST_REJECTED",
        },
        { status: 502 },
      );
    }

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
