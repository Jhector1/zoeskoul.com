import { FeatureKey } from "@zoeskoul/db";
import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import { appCorsJson, isAppOriginAllowed, isAppMutationOriginAllowed } from "@/lib/http/appCors";
import { inspectBuilderAiBillingForUser } from "@/lib/billing/reconcileBuilderAiBillingForUser";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_FEATURES = [
  FeatureKey.build_ai_generate,
  FeatureKey.build_ai_edit,
] as const;

function reply(req: Request, body: Record<string, unknown>, status = 200) {
  const response = appCorsJson(req, body, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Read-only, self-scoped Builder AI access inspection.
 * Unlike the admin grant-audit route, this NEVER accepts a target user ID.
 * Authentication and the canonical User.id are resolved server-side.
 * It does not issue, reconcile, revoke, or infer entitlements.
 */
export async function GET(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return reply(req, { error: "Forbidden" }, 403);
  }

  try {
    const access = await getCurrentUserAccess();
    if (!access.authenticated || !access.user?.id) {
      return reply(req, { error: "Unauthorized" }, 401);
    }

    const grants = await prisma.featureGrant.findMany({
      where: {
        userId: access.user.id,
        feature: { in: [...BUILD_FEATURES] },
        revokedAt: null,
      },
      select: {
        feature: true,
        type: true,
        startsAt: true,
        endsAt: true,
      },
    });

    const now = new Date();
    const features = Object.fromEntries(BUILD_FEATURES.map((feature) => {
      const active = grants.filter((grant) =>
        grant.feature === feature &&
        (grant.startsAt === null || grant.startsAt <= now) &&
        (grant.endsAt === null || grant.endsAt > now),
      );
      return [feature, {
        enabled: active.length > 0,
        activeGrantCount: active.length,
        grantTypes: [...new Set(active.map((grant) => grant.type))],
      }];
    }));

    const billing = await inspectBuilderAiBillingForUser(access.user.id, { now });
    const generateEnabled = (features[FeatureKey.build_ai_generate] as { enabled: boolean }).enabled;
    const editEnabled = (features[FeatureKey.build_ai_edit] as { enabled: boolean }).enabled;
    return reply(req, {
      checkedAt: now.toISOString(),
      isAdmin: access.capabilities.isAdmin,
      features,
      billing: {
        catalogConfigured: billing.catalogConfigured,
        subscriptionCount: billing.subscriptionCount,
        matchedProductCount: billing.matchedProductCount,
        eligibleSubscriptionCount: billing.eligibleSubscriptionCount,
        eligible: billing.eligible,
        grantMismatch: billing.eligible && generateEnabled !== editEnabled,
      },
    });
  } catch {
    // No SQL, cookies, session details, user IDs, or grant metadata in errors.
    return reply(req, { error: "Builder AI access check unavailable" }, 503);
  }
}


/**
 * Explicit, same-user, rate-limited repair request. Never accepts userId,
 * plan, feature or price assertions from the browser. A local eligible
 * subscription is required before a live Stripe read; the Stripe sync then
 * refreshes authoritative subscription state and performs the canonical,
 * subscription-owned grant projection. GET above remains strictly read-only.
 */
export async function POST(req: Request) {
  if (!isAppMutationOriginAllowed(req) ||
      req.headers.get("origin") !== new URL(req.url).origin) {
    return reply(req, { error: "Forbidden" }, 403);
  }
  try {
    const access = await getCurrentUserAccess();
    if (!access.authenticated || !access.user?.id) {
      return reply(req, { error: "Unauthorized" }, 401);
    }
    const limited = await rateLimit(
      `zoebuild-ai-repair:${access.user.id}`,
      { bucket: "zoebuild-ai-repair", limit: 3, window: "1 h" },
    ).catch(() => null);
    if (!limited) return reply(req, { error: "Repair temporarily unavailable" }, 503);
    if (!limited.ok) return reply(req, { error: "Too many repair requests" }, 429);

    // A generation grant is NOT proof of subscription eligibility.
    const before = await inspectBuilderAiBillingForUser(access.user.id);
    if (!before.catalogConfigured || !before.eligible) {
      return reply(req, {
        error: "No locally verified eligible Builder AI subscription. No grants were changed.",
        code: "BUILDER_AI_SUBSCRIPTION_NOT_ELIGIBLE",
      }, 409);
    }

    // Canonical Stripe sync verifies the remote billing state before projecting.
    // An expired or canceled remote subscription will not gain editing access.
    const { syncSubscriptionsForUser } = await import("@/lib/billing/stripeService");
    await syncSubscriptionsForUser(access.user.id);
    const after = await inspectBuilderAiBillingForUser(access.user.id);
    const now = new Date();
    const grants = await prisma.featureGrant.findMany({
      where: { userId: access.user.id, feature: { in: [...BUILD_FEATURES] }, revokedAt: null },
      select: { feature: true, startsAt: true, endsAt: true },
    });
    const enabled = (feature: FeatureKey) => grants.some((grant) =>
      grant.feature === feature &&
      (grant.startsAt === null || grant.startsAt <= now) &&
      (grant.endsAt === null || grant.endsAt > now),
    );
    const generateEnabled = enabled(FeatureKey.build_ai_generate);
    const editEnabled = enabled(FeatureKey.build_ai_edit);
    return reply(req, {
      ok: after.eligible && generateEnabled && editEnabled,
      billingEligible: after.eligible,
      generateEnabled,
      editEnabled,
      checkedAt: now.toISOString(),
    }, after.eligible && generateEnabled && editEnabled ? 200 : 409);
  } catch {
    return reply(req, {
      error: "Verified Builder AI billing sync unavailable. No editing permission was assumed.",
    }, 503);
  }
}
