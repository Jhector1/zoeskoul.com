import { validateCreditConversion, assertZoeCommercialPack, assertZoeCommercialConversion, ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET, type AiCreditConversion } from "./creditMath";

/**
 * V12J.19 — exact arithmetic for independent credit-pack economic review.
 * This is NOT a price approval, and cannot authorize a Stripe charge or wallet
 * grant. The actual fee ceiling must be independently reviewed; nothing is
 * inferred from Stripe mode, a guessed fee percentage or an LLM response.
 */
export class ZoeCreditEconomicsError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ZoeCreditEconomicsError"; }
}

const MAX_INT64 = (1n << 63n) - 1n;
const POSITIVE = /^[1-9][0-9]*$/;
const NONNEGATIVE = /^(?:0|[1-9][0-9]*)$/;
const NANODOLLARS_PER_CENT = 10_000_000n;

function integer(value: string, label: string, zeroAllowed = false): bigint {
  if (typeof value !== "string" || !(zeroAllowed ? NONNEGATIVE : POSITIVE).test(value))
    throw new ZoeCreditEconomicsError(`AI_CREDIT_ECONOMICS_${label}_INVALID`);
  const parsed = BigInt(value);
  if (parsed > MAX_INT64) throw new ZoeCreditEconomicsError(`AI_CREDIT_ECONOMICS_${label}_OUT_OF_RANGE`);
  return parsed;
}

export type ZoeReviewedPackEconomics = Readonly<{
  /** Exact source-reviewed Stripe price in minor currency units (USD cents). */
  amountUsdMinor: number;
  /** Exact funded credit units (not a floating-point display credit). */
  creditUnits: string;
  /** Independent maximum processing fee in provider USD nanodollars. */
  processorFeeMaximumUsdNano: string;
  /** Explicit minimum retained margin; may be zero only with documented review. */
  requiredMarginUsdNano: string;
  conversion: AiCreditConversion;
}>;

export type ZoeCreditPackCoverage = Readonly<{
  revenueUsdNano: string;
  maximumProviderLiabilityUsdNano: string;
  processorFeeMaximumUsdNano: string;
  requiredMarginUsdNano: string;
  minimumSurplusUsdNano: string;
}>;

/**
 * A conservative liability ceiling from the same snapped conversion used by
 * canonical wallet settlement. Floor here is conservative: the live charger
 * rounds UP units for each request, never consuming fewer than the exact ratio.
 * Reviews must separately account for refund/chargeback losses, taxes,
 * subscription subsidies and actual provider price changes.
 */
export function assertZoeReviewedCreditPackCoverage(input: ZoeReviewedPackEconomics): ZoeCreditPackCoverage {
  if (!Number.isSafeInteger(input.amountUsdMinor) || input.amountUsdMinor <= 0)
    throw new ZoeCreditEconomicsError("AI_CREDIT_ECONOMICS_PRICE_INVALID");
  const units = integer(input.creditUnits, "FUNDED_UNITS");
  const fee = integer(input.processorFeeMaximumUsdNano, "PROCESSOR_FEE", true);
  const margin = integer(input.requiredMarginUsdNano, "MARGIN", true);
  const factors = validateCreditConversion(input.conversion);
  const revenue = BigInt(input.amountUsdMinor) * NANODOLLARS_PER_CENT;
  // Never rely on floating-point token/USD conversions.
  const numerator = units * factors.creditValueUsdNano * factors.markupDenominator;
  const denominator = factors.creditUnitsPerCredit * factors.markupNumerator;
  const liability = numerator / denominator;
  if (fee + margin + liability > revenue)
    throw new ZoeCreditEconomicsError("AI_CREDIT_ECONOMICS_INSUFFICIENT_COVERAGE");
  return {
    revenueUsdNano: revenue.toString(),
    maximumProviderLiabilityUsdNano: liability.toString(),
    processorFeeMaximumUsdNano: fee.toString(),
    requiredMarginUsdNano: margin.toString(),
    minimumSurplusUsdNano: (revenue - fee - liability).toString(),
  };
}


/** Arithmetic proof for the owner-approved commercial target. Does not certify
 * merchant account processing fees or authorize live payments. */
export function evaluateZoeOwnerApprovedCommercialTarget() {
  const target = ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET;
  assertZoeCommercialPack(target);
  assertZoeCommercialConversion(target.conversion);
  const coverage = assertZoeReviewedCreditPackCoverage({
    amountUsdMinor: target.amountUsdMinor,
    creditUnits: target.creditUnits,
    processorFeeMaximumUsdNano: target.processorFeeAllowanceUsdNano,
    requiredMarginUsdNano: target.minimumRequiredMarginUsdNano,
    conversion: target.conversion,
  });
  const surplus = BigInt(coverage.minimumSurplusUsdNano);
  const margin = BigInt(target.minimumRequiredMarginUsdNano);
  if (surplus < margin) {
    throw new ZoeCreditEconomicsError("AI_CREDIT_OWNER_TARGET_MARGIN_INSUFFICIENT");
  }
  return {
    ...coverage,
    surplusBeyondRequiredMarginUsdNano: (surplus - margin).toString(),
    status: target.status,
    merchantFeesIndependentlyVerified: target.merchantFeesIndependentlyVerified,
    liveStripePriceApproved: target.liveStripePriceApproved,
    operationalReleaseApproved: target.operationalReleaseApproved,
  } as const;
}
