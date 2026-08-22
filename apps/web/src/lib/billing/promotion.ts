export type BillingPlan = "monthly" | "yearly";
export type BillingPromotionPlanScope = BillingPlan | "both";

export type BillingPromotionProjection = {
  id: string;
  name: string;
  percentOff: number;
  planScope: BillingPromotionPlanScope;
  startsAt: string;
  endsAt: string;
  discountedUnitAmountMinor?: number;
  discountedPriceLabel?: string;
};

export type BillingPromotionWindow = {
  enabled: boolean;
  planScope: BillingPromotionPlanScope;
  startsAt: Date | string;
  endsAt: Date | string;
};

function millis(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function promotionAppliesToPlan(scope: BillingPromotionPlanScope, plan: BillingPlan) {
  return scope === "both" || scope === plan;
}

export function billingPromotionIsActive(campaign: BillingPromotionWindow, now = new Date()) {
  const start = millis(campaign.startsAt);
  const end = millis(campaign.endsAt);
  const nowMs = now.getTime();
  return Boolean(campaign.enabled && Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && end > nowMs);
}

export function billingPromotionWindowsOverlap(
  left: Pick<BillingPromotionWindow, "planScope" | "startsAt" | "endsAt">,
  right: Pick<BillingPromotionWindow, "planScope" | "startsAt" | "endsAt">,
) {
  const sharesPlan = left.planScope === "both" || right.planScope === "both" || left.planScope === right.planScope;
  return sharesPlan && millis(left.startsAt) < millis(right.endsAt) && millis(left.endsAt) > millis(right.startsAt);
}

export function discountedMinorUnits(amountMinor: number, percentOff: number) {
  if (!Number.isFinite(amountMinor)) return 0;
  const bounded = Math.min(100, Math.max(0, percentOff));
  return Math.max(0, Math.round(amountMinor * (100 - bounded) / 100));
}
