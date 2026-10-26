import {
  assertZoeCommercialPack,
  ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET,
} from "@zoeskoul/platform-server/ai-credits/math";

/**
 * V12J.26: evidence-scoped release records for live Stripe credit packs.
 * A pack can only be listed in production once BOTH the price allowlist and
 * its separately reviewed operational record match. This module cannot
 * authorize customer charging merely by changing an environment variable.
 * Source-controlled records are evidence references, not verification that
 * the external source is accurate: a human reviewer must check each source.
 */
export type ZoeBuildLiveReleaseEvidence = Readonly<{
  stripeLivePrice: string;
  merchantProcessingFees: string;
  paymentMethodsAndTaxes: string;
  refundsDisputesReconciliation: string;
  requiredMeteringAndResultRecovery: string;
  alertsAuditAndIncidentResponse: string;
}>;

export type ZoeBuildReviewedLiveRelease = Readonly<{
  priceId: string;
  amountUsdMinor: number;
  creditUnits: string;
  conversionVersionId: string;
  currency: "usd";
  processorFeeUpperBoundUsdNano: string;
  reviewedAt: string;
  reviewerId: string;
  evidenceRefs: ZoeBuildLiveReleaseEvidence;
}>;

export class ZoeBuildLiveReleaseError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildLiveReleaseError";
  }
}

/** Independently verified live evidence only. EMPTY until reviewed. */
export const ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS: readonly ZoeBuildReviewedLiveRelease[] =
  Object.freeze([]);

const REQUIRED_FIELDS = [
  "stripeLivePrice", "merchantProcessingFees", "paymentMethodsAndTaxes",
  "refundsDisputesReconciliation", "requiredMeteringAndResultRecovery",
  "alertsAuditAndIncidentResponse",
] as const;
const PRICE = /^price_[A-Za-z0-9_]+$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{7,199}$/;
const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const POSITIVE = /^[1-9][0-9]*$/;
const REVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function refuse(code: string): never { throw new ZoeBuildLiveReleaseError(code); }

/** Resolve one exact reviewed record, never a browser- or env-supplied review. */
export function assertZoeBuildLivePackReleased(input: Readonly<{
  pack: Readonly<{priceId:string;amountUsdMinor:number;creditUnits:string}>;
  reviews: readonly ZoeBuildReviewedLiveRelease[];
  occurredAt: Date;
}>): ZoeBuildReviewedLiveRelease {
  const {pack,reviews,occurredAt} = input;
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime()))
    refuse("AI_CREDIT_LIVE_RELEASE_TIME_INVALID");
  if (!PRICE.test(pack.priceId)) refuse("AI_CREDIT_LIVE_PRICE_ID_INVALID");
  assertZoeCommercialPack(pack);
  const matches=reviews.filter(item=>item.priceId===pack.priceId);
  if (matches.length!==1) refuse(matches.length===0
    ? "AI_CREDIT_LIVE_RELEASE_NOT_APPROVED" : "AI_CREDIT_LIVE_RELEASE_AMBIGUOUS");
  const review=matches[0]!;
  const target=ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET;
  if (review.amountUsdMinor!==pack.amountUsdMinor ||
      review.creditUnits!==pack.creditUnits ||
      review.conversionVersionId!==target.conversion.versionId ||
      review.currency!=="usd") refuse("AI_CREDIT_LIVE_RELEASE_SCOPE_MISMATCH");
  const reviewedAt=Date.parse(review.reviewedAt);
  const age=occurredAt.getTime()-reviewedAt;
  if (!Number.isFinite(reviewedAt)||age<0||age>REVIEW_TTL_MS)
    refuse("AI_CREDIT_LIVE_RELEASE_EXPIRED");
  if (!REVIEWER.test(review.reviewerId))
    refuse("AI_CREDIT_LIVE_RELEASE_REVIEWER_INVALID");
  if (!POSITIVE.test(review.processorFeeUpperBoundUsdNano))
    refuse("AI_CREDIT_LIVE_RELEASE_FEE_UNVERIFIED");
  const fee=BigInt(review.processorFeeUpperBoundUsdNano);
  if (fee>BigInt(target.processorFeeAllowanceUsdNano))
    refuse("AI_CREDIT_LIVE_RELEASE_FEE_EXCEEDS_ALLOWANCE");
  if (!review.evidenceRefs || typeof review.evidenceRefs!=="object")
    refuse("AI_CREDIT_LIVE_RELEASE_EVIDENCE_INCOMPLETE");
  const refs=REQUIRED_FIELDS.map(field=>review.evidenceRefs[field]);
  if (refs.some(value=>typeof value!=="string"||!REF.test(value)) ||
      new Set(refs).size!==REQUIRED_FIELDS.length)
    refuse("AI_CREDIT_LIVE_RELEASE_EVIDENCE_INCOMPLETE");
  return review;
}
