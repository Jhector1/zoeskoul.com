import "server-only";

import type { PrismaClient } from "@zoeskoul/db";
import { prisma } from "@/lib/prisma";
import { hasCurrentSubscriptionAccess } from "@zoeskoul/platform-server/billing/subscriptionEligibility";
import { resolvePlatformBillingCatalog } from "@zoeskoul/platform-server/billing/productCatalog";
import { verifiedPlatformSubscriptionRows } from "@zoeskoul/platform-server/billing/platformSubscriptionOwnership";
import { reconcileBuilderAiSubscriptionGrants } from "./reconcileBuilderAiSubscriptionGrants";

type Options = Readonly<{
  client?: PrismaClient;
  now?: Date;
}>;

type SubscriptionWindow = Readonly<{
  status: string;
  priceId: string | null;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}>;

function entitlementEnd(subscription: SubscriptionWindow): Date | null {
  return subscription.status === "trialing"
    ? subscription.trialEnd
    : subscription.currentPeriodEnd;
}

/**
 * Server-side billing projection. A matching Stripe price ID and a currently
 * eligible subscription are BOTH required. Never trust a browser/model claim.
 * Runs after canonical subscription persistence and customer deletion, and
 * reconciles both capabilities including the revocation path.
 */
export async function reconcileBuilderAiBillingForUser(userId: string, options: Options = {}) {
  const normalizedUserId = userId.trim();
  const inspection = await inspectBuilderAiBillingForUser(normalizedUserId, options);
  return reconcileBuilderAiSubscriptionGrants({
    client: options.client ?? prisma,
    userId: normalizedUserId,
    eligibility: {
      subscriptionActive: inspection.eligible,
      productIncludesBuilderAi: inspection.eligible,
    },
    endsAt: inspection.endsAt,
    now: options.now ?? new Date(),
  });
}


/**
 * Read-only view of exactly the billing conditions used by reconciliation.
 * It never exposes customer, subscription, or Stripe price identifiers.
 * Both account diagnostics and the canonical grant writer share this policy.
 */
export async function inspectBuilderAiBillingForUser(userId: string, options: Options = {}) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error("Builder AI billing inspection requires a user id.");
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const catalog = new Set(resolvePlatformBillingCatalog(process.env).filter(p => p.product === "builder_ai").map(p => p.priceId));
  const [user, subscriptions] = await Promise.all([
    client.user.findUnique({where:{id:normalizedUserId},select:{stripeCustomerId:true}}),
    client.subscription.findMany({
    where: { userId: normalizedUserId },
    select: { status: true, priceId: true, billingProduct: true, trialEnd: true, currentPeriodEnd: true, stripeCustomerId: true },
    }),
  ]);
  const owned = verifiedPlatformSubscriptionRows({storedStripeCustomerId:user?.stripeCustomerId,rows:subscriptions});
  const matching = owned.filter((subscription) =>
    Boolean(subscription.billingProduct === "builder_ai" && subscription.priceId && catalog.has(subscription.priceId)),
  );
  const eligible = matching.filter((subscription) => hasCurrentSubscriptionAccess({
    status: subscription.status,
    trialEnd: subscription.trialEnd,
    currentPeriodEnd: subscription.currentPeriodEnd,
    nowMs: now.getTime(),
  }));
  const endsAt = eligible.map(entitlementEnd)
    .filter((end): end is Date => end instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    catalogConfigured: catalog.size > 0,
    subscriptionCount: subscriptions.length,
    matchedProductCount: matching.length,
    eligibleSubscriptionCount: eligible.length,
    eligible: eligible.length > 0,
    endsAt,
  } as const;
}
