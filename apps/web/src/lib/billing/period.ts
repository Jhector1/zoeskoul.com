export type BillingPeriodValue =
  | Date
  | string
  | null
  | undefined;

function billingPeriodMs(
  value: BillingPeriodValue,
): number | null {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function futureBillingPeriodIsoOrNull(
  value: BillingPeriodValue,
  nowMs = Date.now(),
): string | null {
  const ms = billingPeriodMs(value);
  if (ms === null || ms <= nowMs) return null;
  return new Date(ms).toISOString();
}


export function hasCurrentSubscriptionAccess(args: {
  status?: string | null;
  trialEnd?: BillingPeriodValue;
  currentPeriodEnd?: BillingPeriodValue;
  nowMs?: number;
}): boolean {
  const nowMs = args.nowMs ?? Date.now();

  if (args.status === "trialing") {
    return Boolean(
      futureBillingPeriodIsoOrNull(args.trialEnd, nowMs),
    );
  }

  if (
    args.status === "active" ||
    args.status === "past_due" ||
    args.status === "canceled"
  ) {
    return Boolean(
      futureBillingPeriodIsoOrNull(
        args.currentPeriodEnd,
        nowMs,
      ),
    );
  }

  return false;
}

export function scheduledCancellationEndIso(args: {
  status?: string | null;
  trialEnd?: BillingPeriodValue;
  currentPeriodEnd?: BillingPeriodValue;
  cancelAtPeriodEnd?: boolean | null;
  nowMs?: number;
}): string | null {
  if (!args.cancelAtPeriodEnd) return null;

  const nowMs = args.nowMs ?? Date.now();

  if (args.status === "trialing") {
    return futureBillingPeriodIsoOrNull(
      args.trialEnd,
      nowMs,
    );
  }

  if (args.status === "active") {
    return futureBillingPeriodIsoOrNull(
      args.currentPeriodEnd,
      nowMs,
    );
  }

  return null;
}

export function canResumeScheduledSubscription(
  args: Parameters<typeof scheduledCancellationEndIso>[0],
): boolean {
  return Boolean(scheduledCancellationEndIso(args));
}

export function shouldShowRenewalDate(args: {
  status?: string | null;
  currentPeriodEnd?: BillingPeriodValue;
  cancelAtPeriodEnd?: boolean | null;
  nowMs?: number;
}): boolean {
  if (args.status !== "active") return false;
  if (args.cancelAtPeriodEnd) return false;

  return Boolean(
    futureBillingPeriodIsoOrNull(
      args.currentPeriodEnd,
      args.nowMs ?? Date.now(),
    ),
  );
}
