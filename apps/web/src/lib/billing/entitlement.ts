// src/lib/billing/entitlement.ts
import { prisma } from "@/lib/prisma";
import type { StripeSubscriptionStatus } from "@prisma/client";

type DenyReason =
  | "none"
  | "expired"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "paused"
  | "incomplete"
  | "incomplete_expired";

export type Entitlement =
  | {
      ok: true;
      reason: "active" | "trialing";
      status: StripeSubscriptionStatus;
      subscriptionId?: string;
      priceId?: string | null;
      currentPeriodEnd?: Date | null;
      trialEnd?: Date | null;
      cancelAtPeriodEnd?: boolean;
    }
  | {
      ok: false;
      reason: DenyReason;
      status?: StripeSubscriptionStatus;
      subscriptionId?: string;
      priceId?: string | null;
      currentPeriodEnd?: Date | null;
      trialEnd?: Date | null;
      cancelAtPeriodEnd?: boolean;
    };

function isFuture(d?: Date | null) {
  return !!d && d.getTime() > Date.now();
}

export async function getEntitlementForUser(userId: string): Promise<Entitlement> {
  const subs = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      stripeSubscriptionId: true,
      status: true,
      priceId: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      trialEnd: true,
      updatedAt: true,
    },
  });

  if (!subs.length) return { ok: false, reason: "none" };

  // Prefer active/trialing if any exist, else newest
  const preferred = subs.find((s) => s.status === "active" || s.status === "trialing");
  const sub = preferred ?? subs[0];

  const withinPeriod = isFuture(sub.currentPeriodEnd);
  const withinTrial = isFuture(sub.trialEnd);

  const base = {
    status: sub.status,
    subscriptionId: sub.stripeSubscriptionId,
    priceId: sub.priceId,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEnd: sub.trialEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };

  // Deny states
  if (sub.status === "incomplete") return { ok: false, reason: "incomplete", ...base };
  if (sub.status === "incomplete_expired") return { ok: false, reason: "incomplete_expired", ...base };
  if (sub.status === "paused") return { ok: false, reason: "paused", ...base };
  if (sub.status === "unpaid") return { ok: false, reason: "unpaid", ...base };

  if (sub.status === "trialing") {
    return withinTrial || withinPeriod
      ? { ok: true, reason: "trialing", ...base }
      : { ok: false, reason: "expired", ...base };
  }

  if (sub.status === "active") {
    // allow if within period; if missing periodEnd, allow (some setups)
    if (withinPeriod || !sub.currentPeriodEnd) return { ok: true, reason: "active", ...base };
    return { ok: false, reason: "expired", ...base };
  }

  if (sub.status === "past_due") {
    // grace until period end
    return withinPeriod ? { ok: true, reason: "active", ...base } : { ok: false, reason: "past_due", ...base };
  }

  if (sub.status === "canceled") {
    // allow until period end
    return withinPeriod ? { ok: true, reason: "active", ...base } : { ok: false, reason: "canceled", ...base };
  }

  // fallback
  return withinPeriod ? { ok: true, reason: "active", ...base } : { ok: false, reason: "expired", ...base };
}
