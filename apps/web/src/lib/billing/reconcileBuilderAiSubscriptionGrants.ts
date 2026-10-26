import "server-only";

import type { PrismaClient } from "@zoeskoul/db";
import {
  canonicalUserActorKey,
  reconcileFeatureGrant,
} from "@zoeskoul/platform-server/access/reconcileFeatureGrant";
import {
  BUILDER_AI_FEATURE_KEYS,
  builderAiSubscriptionFeatures,
  type BuilderAiSubscriptionEligibility,
} from "./buildAiSubscriptionPolicy";

/**
 * Idempotent grant projection from an already-verified billing policy.
 * Only the canonical billing adapter can establish eligibility; callers must
 * not pass browser or model-provided plan assertions. The grant type isolates
 * subscription revocations from independently authorized admin assignments.
 *
 * Reconciliation deliberately visits every owned feature on BOTH activation
 * and revocation. Partial failures are safe to retry using deterministic IDs.
 */
export async function reconcileBuilderAiSubscriptionGrants(input: Readonly<{
  client: PrismaClient;
  userId: string;
  eligibility: BuilderAiSubscriptionEligibility;
  endsAt: Date | null;
  now?: Date;
}>) {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Builder AI reconciliation requires a user id.");
  const included = new Set(builderAiSubscriptionFeatures(input.eligibility));
  const results = [];
  for (const feature of BUILDER_AI_FEATURE_KEYS) {
    const active = included.has(feature);
    results.push({
      feature,
      ...(await reconcileFeatureGrant({
        client: input.client,
        userId,
        actorKey: canonicalUserActorKey(userId),
        feature,
        type: "subscription",
        active,
        endsAt: active ? input.endsAt : input.now ?? new Date(),
        now: input.now,
        meta: {
          source: "verified_builder_subscription",
          entitlement: feature,
        },
      })),
    });
  }
  return results;
}
