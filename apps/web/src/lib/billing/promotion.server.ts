import "server-only";
import { prisma } from "@/lib/prisma";
import { billingPromotionIsActive, billingPromotionWindowsOverlap, promotionAppliesToPlan, type BillingPlan, type BillingPromotionPlanScope, type BillingPromotionProjection } from "@/lib/billing/promotion";

type PromotionRow = {
  id: string; name: string; percentOff: number; planScope: BillingPromotionPlanScope;
  startsAt: Date; endsAt: Date; enabled: boolean; stripeCouponId: string;
};

function toRow(row: Omit<PromotionRow, "planScope"> & { planScope: string }): PromotionRow {
  return { ...row, planScope: row.planScope as BillingPromotionPlanScope };
}

export function toBillingPromotionProjection(row: PromotionRow | null | undefined): BillingPromotionProjection | null {
  if (!row) return null;
  return { id: row.id, name: row.name, percentOff: row.percentOff, planScope: row.planScope, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
}

export async function getActiveBillingPromotions(now = new Date()) {
  const rows = await prisma.billingPromotionCampaign.findMany({
    where: { enabled: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, percentOff: true, planScope: true, startsAt: true, endsAt: true, enabled: true, stripeCouponId: true },
  });
  const active = rows.map(toRow).filter((row) => billingPromotionIsActive(row, now));
  const pick = (plan: BillingPlan) => active.find((row) => promotionAppliesToPlan(row.planScope, plan)) ?? null;
  return { monthly: pick("monthly"), yearly: pick("yearly") };
}

export async function getActiveBillingPromotionForPlan(plan: BillingPlan, now = new Date()) {
  const active = await getActiveBillingPromotions(now);
  return active[plan];
}

export async function findOverlappingBillingPromotion(args: { planScope: BillingPromotionPlanScope; startsAt: Date; endsAt: Date; excludeId?: string | null }) {
  const rows = await prisma.billingPromotionCampaign.findMany({
    where: { enabled: true, ...(args.excludeId ? { id: { not: args.excludeId } } : {}), startsAt: { lt: args.endsAt }, endsAt: { gt: args.startsAt } },
    select: { id: true, name: true, planScope: true, startsAt: true, endsAt: true },
  });
  return rows.find((row) => billingPromotionWindowsOverlap(
    { planScope: args.planScope, startsAt: args.startsAt, endsAt: args.endsAt },
    { planScope: row.planScope as BillingPromotionPlanScope, startsAt: row.startsAt, endsAt: row.endsAt },
  )) ?? null;
}
