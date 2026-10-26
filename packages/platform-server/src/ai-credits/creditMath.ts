/** E16C3 precise conversion from provider API nanodollars to AI credit units. */
export class AiCreditError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiCreditError";
  }
}

export type AiCreditConversion = Readonly<{
  versionId: string;
  creditUnitsPerCredit: string;
  creditValueUsdNano: string;
  markupNumerator: string;
  markupDenominator: string;
}>;

const MAX_INT64 = (1n << 63n) - 1n;
export function positiveInteger(value: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new AiCreditError(`INVALID_${label}`);
  const parsed = BigInt(value);
  if (parsed > MAX_INT64) throw new AiCreditError(`OUT_OF_RANGE_${label}`);
  return parsed;
}
export function nonnegativeInteger(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new AiCreditError(`INVALID_${label}`);
  return BigInt(value);
}
export function validateCreditConversion(value: AiCreditConversion) {
  if (!value.versionId.trim() || value.versionId.length > 160) {
    throw new AiCreditError("INVALID_CONVERSION_VERSION");
  }
  return {
    creditUnitsPerCredit: positiveInteger(value.creditUnitsPerCredit, "UNITS_PER_CREDIT"),
    creditValueUsdNano: positiveInteger(value.creditValueUsdNano, "VALUE_NANO_USD"),
    markupNumerator: positiveInteger(value.markupNumerator, "MARKUP_NUMERATOR"),
    markupDenominator: positiveInteger(value.markupDenominator, "MARKUP_DENOMINATOR"),
  };
}
/**
 * Round up ONCE per settled request. A priced zero-cost response charges zero.
 * Conversion version and factors must be snapshotted on the reservation.
 */
export function providerNanoUsdToCreditUnits(costUsdNano: string, conversion: AiCreditConversion): bigint {
  const cost = nonnegativeInteger(costUsdNano, "PROVIDER_COST");
  const factors = validateCreditConversion(conversion);
  const numerator = cost * factors.markupNumerator * factors.creditUnitsPerCredit;
  const denominator = factors.markupDenominator * factors.creditValueUsdNano;
  const result = (numerator + denominator - 1n) / denominator;
  if (result > MAX_INT64) throw new AiCreditError("CHARGE_TOO_LARGE");
  return result;
}

export type AiCreditBucket = Readonly<{
  id: string;
  kind: "subscription" | "purchased";
  availableUnits: bigint;
  expiresAt: Date | null;
  createdAt: Date;
}>;
/** Deterministic: expiring subscription first, then purchased, earliest expiry first. */
export function allocateAiCreditUnits(lots: readonly AiCreditBucket[], amount: bigint, now: Date) {
  if (amount <= 0n) throw new AiCreditError("INVALID_RESERVATION");
  const sorted = lots.filter(l => l.availableUnits > 0n && (!l.expiresAt || l.expiresAt > now))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "subscription" ? -1 : 1;
      const expiry = (a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
      return expiry || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
    });
  let remaining = amount;
  const allocated: { lotId: string; units: bigint }[] = [];
  for (const lot of sorted) {
    if (!remaining) break;
    const units = lot.availableUnits < remaining ? lot.availableUnits : remaining;
    allocated.push({ lotId: lot.id, units });
    remaining -= units;
  }
  if (remaining !== 0n) throw new AiCreditError("INSUFFICIENT_CREDITS");
  return allocated;
}


/**
 * V12J.25 — owner-approved COMMERCIAL TARGET, not a Stripe live release or
 * independently verified merchant fee. This is the canonical cross-app
 * amount and AI-cost conversion for any future approved ZoeBuild AI pack.
 * Existing reservations retain the conversion snapshotted when they began.
 */
export const ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET = Object.freeze({
  decisionDate: "2026-10-24",
  status: "owner-approved-target" as const,
  amountUsdMinor: 500,
  creditUnits: "500000",
  customerCredits: 500,
  processorFeeAllowanceUsdNano: "750000000",
  minimumRequiredMarginUsdNano: "250000000",
  conversion: Object.freeze({
    versionId: "zoebuild-v12j25-owner-approved-v1",
    creditUnitsPerCredit: "1000",
    creditValueUsdNano: "10000000",
    markupNumerator: "2",
    markupDenominator: "1",
  } satisfies AiCreditConversion),
  merchantFeesIndependentlyVerified: false,
  liveStripePriceApproved: false,
  operationalReleaseApproved: false,
});

/** Runtime matching requires *all* versioned conversion factors to agree.
 * It never changes historical snaps or accepts caller-supplied economics. */
export function assertZoeCommercialConversion(actual: AiCreditConversion): void {
  validateCreditConversion(actual);
  const expected = ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET.conversion;
  if (actual.versionId !== expected.versionId ||
      actual.creditUnitsPerCredit !== expected.creditUnitsPerCredit ||
      actual.creditValueUsdNano !== expected.creditValueUsdNano ||
      actual.markupNumerator !== expected.markupNumerator ||
      actual.markupDenominator !== expected.markupDenominator) {
    throw new AiCreditError("AI_CREDIT_COMMERCIAL_CONVERSION_MISMATCH");
  }
}

/** The commercial decision authorizes one product configuration, not a
 * live Stripe Price ID or the actual payment processing cost. */
export function assertZoeCommercialPack(pack: Readonly<{
  amountUsdMinor: number; creditUnits: string;
}>): void {
  const target = ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET;
  if (pack.amountUsdMinor !== target.amountUsdMinor ||
      pack.creditUnits !== target.creditUnits) {
    throw new AiCreditError("AI_CREDIT_COMMERCIAL_PACK_MISMATCH");
  }
}
