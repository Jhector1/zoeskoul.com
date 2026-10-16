import "server-only";

import { FeatureKey, type PrismaClient } from "@zoeskoul/db";
import {
  canonicalUserActorKey,
  reconcileFeatureGrant,
} from "@zoeskoul/platform-server/access/reconcileFeatureGrant";

import { prisma } from "@/lib/prisma";
import { hasCurrentSubscriptionAccess } from "@/lib/billing/period";

type ReconcileBuildAiGrantOptions = Readonly<{
  client?: PrismaClient;
  now?: Date;
}>;

function entitledUntil(subscription: {
  status: string;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
}): Date | null {
  return subscription.status === "trialing"
    ? subscription.trialEnd
    : subscription.currentPeriodEnd;
}

/**
 * Project the existing canonical billing entitlement into FeatureGrant.
 *
 * Subscription remains the source of truth. FeatureGrant is the capability
 * projection consumed by ZoeBuild and is never used to decide billing status.
 */
export async function reconcileBuildAiSubscriptionGrantForUser(
  userId: string,
  options: ReconcileBuildAiGrantOptions = {},
) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Build AI grant reconciliation requires a user id.");
  }

  const client = options.client ?? prisma;
  const now = options.now ?? new Date();

  const subscriptions = await client.subscription.findMany({
    where: { userId: normalizedUserId },
    select: {
      status: true,
      trialEnd: true,
      currentPeriodEnd: true,
    },
  });

  const entitled = subscriptions.filter((subscription) =>
    hasCurrentSubscriptionAccess({
      status: subscription.status,
      trialEnd: subscription.trialEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nowMs: now.getTime(),
    }),
  );

  const endsAt =
    entitled
      .map(entitledUntil)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return reconcileFeatureGrant({
    client,
    userId: normalizedUserId,
    actorKey: canonicalUserActorKey(normalizedUserId),
    feature: FeatureKey.build_ai_generate,
    type: "subscription",
    active: entitled.length > 0,
    endsAt,
    now,
    meta: {
      source: "billing_subscription",
      entitlement: "build_ai_generate",
    },
  });
}
