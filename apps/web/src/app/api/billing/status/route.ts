// src/app/api/billing/status/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  billingConfig,
  getPricePresentation,
  syncSubscriptionsForUser,
} from "@/lib/billing/stripeService";
import { getEntitlementForUser } from "@/lib/billing/entitlement";

import { getLocaleFromCookie } from "@/serverUtils";
import { toIntlLocale } from "@/i18n/money";
import {resolveBillingCurrency} from "@/lib/billing/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  const appLocale = await getLocaleFromCookie();
  const intlLocale = toIntlLocale( appLocale);
  const billingCurrency = await resolveBillingCurrency();

  const pricing = await getPricePresentation(intlLocale, billingCurrency);

  const { monthlyPriceId, yearlyPriceId } = billingConfig();

  if (!session?.user) {
    return NextResponse.json({
      isAuthenticated: false,
      isSubscribed: false,

      stripeStatus: null,
      subscriptionId: null,
      priceId: null,

      currentPlan: null,
      trialEligible: false,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,

      // optional but handy for debugging/UX
      appLocale,

      ...pricing,
    });
  }

  const userId = (session.user as any).id as string;

  // Stripe-first freshness
  await syncSubscriptionsForUser(userId).catch(() => {});

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialUsedAt: true },
  });

  const ent = await getEntitlementForUser(userId);
  const isSubscribed = ent.ok;

  const currentPlan =
      ent.priceId === monthlyPriceId
          ? "monthly"
          : ent.priceId === yearlyPriceId
              ? "yearly"
              : null;

  return NextResponse.json({
    isAuthenticated: true,
    isSubscribed,

    stripeStatus: ent.status ?? null,
    subscriptionId: ent.subscriptionId ?? null,
    priceId: ent.priceId ?? null,

    currentPlan,
    trialEligible: !u?.trialUsedAt,

    trialEndsAt: ent.trialEnd ? ent.trialEnd.toISOString() : null,
    currentPeriodEnd: ent.currentPeriodEnd ? ent.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(ent.cancelAtPeriodEnd),

    appLocale,

    ...pricing,
  });
}