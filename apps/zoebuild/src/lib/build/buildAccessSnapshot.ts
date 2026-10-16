import "server-only";

import type {
  BuildAccessSnapshot,
  BuildEntitlementKey,
} from "@zoeskoul/build-application";
import { FeatureKey } from "@zoeskoul/db";
import { prisma } from "@zoeskoul/platform-server/prisma";

function isWithinGrantWindow(
  now: Date,
  startsAt: Date | null,
  endsAt: Date | null,
): boolean {
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

/**
 * ZoeBuild entitlement infrastructure adapter.
 *
 * ZoeBuild resolves the canonical internal User.id before this loader runs.
 * Because Build AI is authenticated-only, FeatureGrant.userId is the stable
 * identity boundary here; we do not duplicate the web app's anonymous actor
 * key conventions.
 *
 * This adapter is intentionally read-only:
 * - it creates no grants;
 * - it does not infer paid access from Stripe directly;
 * - it accepts only active, non-revoked canonical FeatureGrant rows.
 */
export async function loadBuildAccessSnapshot(
  userId: string,
): Promise<BuildAccessSnapshot> {
  const normalizedUserId = userId.trim();
  const entitlements: BuildEntitlementKey[] = [];

  if (!normalizedUserId) {
    return {
      userId: null,
      entitlements,
    };
  }

  const now = new Date();
  const grants = await prisma.featureGrant.findMany({
    where: {
      userId: normalizedUserId,
      feature: FeatureKey.build_ai_generate,
      revokedAt: null,
    },
    select: {
      startsAt: true,
      endsAt: true,
    },
  });

  if (
    grants.some((grant) =>
      isWithinGrantWindow(now, grant.startsAt, grant.endsAt),
    )
  ) {
    entitlements.push("build_ai_generate");
  }

  return {
    userId: normalizedUserId,
    entitlements,
  };
}
