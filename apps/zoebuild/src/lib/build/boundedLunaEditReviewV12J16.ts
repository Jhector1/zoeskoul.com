import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import type { ZoeBuildVerifiedAttemptPolicy } from "./verifiedAiCreditReservationPolicy";
import { resolveReviewedZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";
import { assertPublishedZoeBuildStandardPrice } from "./publishedModelPriceReviews";
import { deriveZoeBuildAttemptReservation } from "./verifiedAiCreditReservationPolicy";

/**
 * V12J.16A nonspending, SOURCE-REVIEW CANDIDATE for one TEXT-ONLY edit.
 * NOT inserted into ZOEBUILD_VERIFIED_AI_BILLING_PROFILES or
 * ZOEBUILD_APPROVED_BILLING_OPERATIONS. No route consumes this proposal.
 * The 2x customer markup is an economics PROPOSAL, not approved pricing.
 * This module makes worst-case economics testable WITHOUT granting permission.
 */
export const BOUNDED_LUNA_EDIT_CANDIDATE: BuildModelCandidate = Object.freeze({
  provider: "openai", model: "gpt-6-luna", tier: "economy",
  reason: "Source-reviewed candidate for bounded text-only edit; spending disabled",
} as const);

export const BOUNDED_LUNA_EDIT_PROPOSAL: ZoeBuildVerifiedAttemptPolicy = Object.freeze({
  pricingCatalog: Object.freeze([{
    id: "zoebuild-luna-global-standard-review-20261023",
    provider: "openai", model: "gpt-6-luna", currency: "USD",
    effectiveFrom: "2026-10-23T00:00:00.000Z",
    rates: Object.freeze([
      {category: "input", usdPerMillionTokens: "0.10"},
      {category: "cached_input", usdPerMillionTokens: "0.01"},
      {category: "cache_write", usdPerMillionTokens: "0.125"},
      {category: "output", usdPerMillionTokens: "0.50"},
    ] as const),
  }] as const),
  pricingVersionId: "zoebuild-luna-global-standard-review-20261023",
  conversion: Object.freeze({
    versionId: "zoebuild-hypothetical-2x-1cent-credit-review-20261023",
    creditUnitsPerCredit: "1000", creditValueUsdNano: "10000000",
    markupNumerator: "2", markupDenominator: "1",
  }),
  maxCombinedInputTokens: 20_000,
  maxOutputTokens: 4_096,
  maxBillableOutputTokens: 4_096,
  evidence: Object.freeze({
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna",
    verifiedAt: "2026-10-23T18:00:00.000Z",
    verifierId: "zoebuild-v12j16a-source-review",
    provider: "openai", model: "gpt-6-luna",
    pricingVersionId: "zoebuild-luna-global-standard-review-20261023",
    inputLimitCoversAllBilledInput: true,
    outputLimitCoversReasoningTokens: true,
    noOtherBillableFeatures: true,
  } as const),
});

/**
 * This returns a REVIEW-ONLY maximum, not user spend authorization.
 * Does not call the provider, DB, Stripe, or any platform route.
 * Production must independently satisfy operational evidence before activation.
 */
export function reviewBoundedLunaEditEconomics(occurredAt: Date) {
  const candidate = BOUNDED_LUNA_EDIT_CANDIDATE;
  const policy = resolveReviewedZoeBuildBillingProfile({
    registry: {profiles: [BOUNDED_LUNA_EDIT_PROPOSAL]},
    candidate, occurredAt,
  });
  assertPublishedZoeBuildStandardPrice({candidate, policy, occurredAt});
  const ceiling = deriveZoeBuildAttemptReservation({candidate, policy, occurredAt});
  return Object.freeze({
    provider: candidate.provider, model: candidate.model,
    maximumCombinedInputTokens: policy.maxCombinedInputTokens,
    maximumBillableOutputTokens: policy.maxBillableOutputTokens,
    maximumProviderCostUsdNano: ceiling.maximumCostUsdNano,
    proposedReservationUnits: ceiling.maximumUnits,
    pricingVersionId: ceiling.pricingVersionId,
    conversionVersionId: policy.conversion.versionId,
    authorizedForSpending: false as const,
  });
}
