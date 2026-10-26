import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import type { ZoeBuildVerifiedAttemptPolicy } from "./verifiedAiCreditReservationPolicy";

/**
 * E16C4D9: a SEPARATE, server-compiled operational sign-off for a model that
 * already passed the independent D2/D3/D6 pricing checks. Evidence references
 * are operator review records, NOT automatic verification of external systems.
 * Production remains blocked until the underlying implementations exist, have
 * been independently tested, and this source-controlled record is reviewed.
 */
export type ZoeBuildOperationalBillingReview = Readonly<{
  provider: "openai";
  model: string;
  pricingVersionId: string;
  conversionVersionId: string;
  reviewedAt: string;
  reviewerId: string;
  processingTier: "default";
  processingEndpoint: "https://api.openai.com/v1";
  regionScope: "global";
  evidenceRefs: Readonly<{
    /** Account/project configuration & billable region confirmation. */
    providerAccountRegion: string;
    /** Credit-unit conversion, markup, and economic loss bounds. */
    creditConversionEconomics: string;
    /** Verified paid-event credit issuance, deduplication, refunds & chargebacks. */
    verifiedFundingAndReversals: string;
    /** Durable reconciliation of unknown/failed provider outcomes and holds. */
    uncertainChargeReconciliation: string;
    /** Authenticated generation AND targeted-edit routes use this same meter. */
    generationAndEditRouteEnforcement: string;
    /** Alerts, aged holds, investigations, dispute process & audit retention. */
    billingOperationsAndAudit: string;
  }>;
}>;

export class ZoeBuildOperationalReadinessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildOperationalReadinessError";
  }
}

/** No production approvals. Must NEVER populate from env, browser, or AI output. */
export const ZOEBUILD_APPROVED_BILLING_OPERATIONS: readonly ZoeBuildOperationalBillingReview[] =
  Object.freeze([]);

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EVIDENCE_FIELDS = [
  "providerAccountRegion",
  "creditConversionEconomics",
  "verifiedFundingAndReversals",
  "uncertainChargeReconciliation",
  "generationAndEditRouteEnforcement",
  "billingOperationsAndAudit",
] as const;
// These are identifiers of external reviewed documents/CI proofs, not secrets.
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{7,199}$/;

/**
 * Pure reviewer-record gate. An explicit `reviews` argument is for unit tests
 * and offline audits ONLY. Production entrypoint omits it, using compiled []
 * until actual funding/reconciliation/route work has been independently proven.
 */
export function assertZoeBuildOperationalBillingReadiness(input: Readonly<{
  candidate: BuildModelCandidate;
  policy: ZoeBuildVerifiedAttemptPolicy;
  occurredAt: Date;
  reviews?: readonly ZoeBuildOperationalBillingReview[];
}>): ZoeBuildOperationalBillingReview {
  const { candidate, policy, occurredAt } = input;
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_TIME_INVALID");
  }
  if (candidate.provider !== "openai") {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_PROVIDER_UNSUPPORTED");
  }
  const matches = (input.reviews ?? ZOEBUILD_APPROVED_BILLING_OPERATIONS)
    .filter(review => review.provider === candidate.provider && review.model === candidate.model);
  if (matches.length !== 1) {
    throw new ZoeBuildOperationalReadinessError(matches.length === 0
      ? "AI_BILLING_OPERATIONS_NOT_APPROVED" : "AI_BILLING_OPERATIONS_AMBIGUOUS");
  }
  const review = matches[0]!;
  if (review.pricingVersionId !== policy.pricingVersionId ||
      review.conversionVersionId !== policy.conversion.versionId ||
      review.processingTier !== "default" ||
      review.processingEndpoint !== "https://api.openai.com/v1" ||
      review.regionScope !== "global") {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_SCOPE_MISMATCH");
  }
  const reviewedAt = Date.parse(review.reviewedAt);
  const ageMs = occurredAt.getTime() - reviewedAt;
  if (!Number.isFinite(reviewedAt) || ageMs < 0 || ageMs > MAX_AGE_MS) {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_REVIEW_STALE");
  }
  if (typeof review.reviewerId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/.test(review.reviewerId)) {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_REVIEWER_INVALID");
  }
  if (!review.evidenceRefs || typeof review.evidenceRefs !== "object") {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
  }
  const evidence = EVIDENCE_FIELDS.map(field => review.evidenceRefs[field]);
  if (evidence.some(ref => typeof ref !== "string" || !REF_PATTERN.test(ref)) ||
      new Set(evidence).size !== EVIDENCE_FIELDS.length) {
    throw new ZoeBuildOperationalReadinessError("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
  }
  return review;
}
