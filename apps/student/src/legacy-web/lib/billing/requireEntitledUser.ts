// src/lib/billing/requireEntitledUser.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlementForUser } from "@/lib/billing/entitlement";
import { syncSubscriptionsForUser } from "@/lib/billing/stripeService";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";

export async function requireEntitledUser() {
  const s = await auth();
  const userId = s?.user?.id;

  if (!userId) {
    return { ok: false as const, res: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  const privileged = await resolvePrivilegedLearningAccess({
    userId,
    email: s?.user?.email ?? null,
  });
  if (privileged.canBypassBilling) {
    return {
      ok: true as const,
      userId,
      entitlement: null,
      billingExempt: true as const,
    };
  }

  // ✅ makes Stripe truth “instant” if webhook is delayed
  await syncSubscriptionsForUser(userId).catch(() => {});

  const ent = await getEntitlementForUser(userId);
  if (!ent.ok) {
    return {
      ok: false as const,
      res: NextResponse.json(
        {
          message: "Subscription required.",
          paywall: true,
          reason: ent.reason,
          status: ent.status,
          currentPeriodEnd: ent.currentPeriodEnd,
          trialEnd: ent.trialEnd,
          redirectTo: "/billing",
        },
        { status: 402 }
      ),
    };
  }

  return { ok: true as const, userId, entitlement: ent, billingExempt: false as const };
}
