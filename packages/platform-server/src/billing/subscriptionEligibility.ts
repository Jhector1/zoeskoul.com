/** Canonical subscription-access window for learning and builder products. */
export type BillingPeriodValue = Date | string | null | undefined;

function futureTime(value: BillingPeriodValue, nowMs: number): boolean {
  if (!value) return false;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

export function hasCurrentSubscriptionAccess(args: Readonly<{
  status?: string | null;
  trialEnd?: BillingPeriodValue;
  currentPeriodEnd?: BillingPeriodValue;
  nowMs?: number;
}>): boolean {
  const nowMs = args.nowMs ?? Date.now();
  if (args.status === "trialing") return futureTime(args.trialEnd, nowMs);
  // Stripe status=canceled is terminal even if an old period_end remains future.
  // cancel_at_period_end keeps status=active until Stripe actually cancels it.
  if (args.status === "active" || args.status === "past_due") {
    return futureTime(args.currentPeriodEnd, nowMs);
  }
  return false;
}
