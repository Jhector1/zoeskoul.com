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
