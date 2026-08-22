// src/app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  billingConfig,
  classifyCheckoutSessionIntent,
  findExistingCheckoutSessionForAttempt,
  getPricePresentation,
  syncSubscriptionsForUser,
} from "@/lib/billing/stripeService";
import { getEntitlementForUser } from "@/lib/billing/entitlement";
import { getActiveBillingPromotions, toBillingPromotionProjection } from "@/lib/billing/promotion.server";

import { getLocaleFromCookie } from "@/serverUtils";
import { toIntlLocale } from "@/i18n/money";
import {resolveBillingCurrency} from "@/lib/billing/currency";
import { futureBillingPeriodIsoOrNull } from "@/lib/billing/period";
import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  const appLocale = await getLocaleFromCookie();
  const intlLocale = toIntlLocale( appLocale);
  const billingCurrency = await resolveBillingCurrency();

  const pricing = await getPricePresentation(intlLocale, billingCurrency);
  const activePromotionRows = await getActiveBillingPromotions();
  const activePromotions = {
    monthly: toBillingPromotionProjection(activePromotionRows.monthly),
    yearly: toBillingPromotionProjection(activePromotionRows.yearly),
  };

  const { monthlyPriceId, yearlyPriceId } = billingConfig();

  if (!session?.user) {
    return NextResponse.json({
      isAuthenticated: false,
      isSubscribed: false,
      billingExempt: false,

      stripeStatus: null,
      subscriptionId: null,
      priceId: null,

      currentPlan: null,
      pendingCheckout: null,
      trialEligible: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      activePromotions,

      // optional but handy for debugging/UX
      appLocale,

      ...pricing,
    });
  }

  const userId = (session.user as any).id as string;

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialUsedAt: true, roles: true, billingCheckoutAttemptId: true },
  });
  const capabilities = resolveRoleCapabilities(u?.roles);
  const billingExempt = capabilities.canBypassBilling;

  if (!billingExempt) {
    // Stripe-first freshness for accounts whose access depends on payment.
    await syncSubscriptionsForUser(userId).catch(() => {});
  }

  const ent = await getEntitlementForUser(userId);
  const isSubscribed = billingExempt || ent.ok;

  const currentPlan =
      ent.priceId === monthlyPriceId
          ? "monthly"
          : ent.priceId === yearlyPriceId
              ? "yearly"
              : null;

  // Presentation-only projection of the one canonical open Checkout.
  // The checkout route/webhook retain sole ownership of mutation and cleanup.
  let pendingCheckout: {
    plan: "monthly" | "yearly";
    useTrial: boolean;
  } | null = null;
  const pendingCheckoutAttemptId = u?.billingCheckoutAttemptId ?? null;

  if (
    !billingExempt &&
    !isSubscribed &&
    isCheckoutAttemptId(pendingCheckoutAttemptId)
  ) {
    try {
      const existingSession = await findExistingCheckoutSessionForAttempt({
        userId,
        checkoutAttemptId: pendingCheckoutAttemptId,
      });

      if (existingSession?.status === "open") {
        const candidates = [
          { plan: "monthly" as const, priceId: monthlyPriceId, useTrial: false },
          { plan: "monthly" as const, priceId: monthlyPriceId, useTrial: true },
          { plan: "yearly" as const, priceId: yearlyPriceId, useTrial: false },
          { plan: "yearly" as const, priceId: yearlyPriceId, useTrial: true },
        ];

        const matchingIntent = candidates.find(
          (candidate) =>
            classifyCheckoutSessionIntent({
              session: existingSession,
              priceId: candidate.priceId,
              useTrial: candidate.useTrial,
            }) === "match",
        );

        if (matchingIntent) {
          pendingCheckout = {
            plan: matchingIntent.plan,
            useTrial: matchingIntent.useTrial,
          };
        }
      }
    } catch {
      // Presentation is best effort. Never guess or mutate on Stripe uncertainty.
    }
  }

  return NextResponse.json({
    isAuthenticated: true,
    isSubscribed,
    billingExempt,

    stripeStatus: ent.status ?? null,
    subscriptionId: ent.subscriptionId ?? null,
    priceId: ent.priceId ?? null,

    currentPlan,
    pendingCheckout,
    trialEligible: !billingExempt && !u?.trialUsedAt,

    trialEndsAt: ent.trialEnd ? ent.trialEnd.toISOString() : null,
    currentPeriodEnd: futureBillingPeriodIsoOrNull(ent.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(ent.cancelAtPeriodEnd),
    activePromotions,

    appLocale,

    ...pricing,
  });
}