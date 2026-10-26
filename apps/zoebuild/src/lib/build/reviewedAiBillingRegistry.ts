import { assertZoeCommercialConversion } from "@zoeskoul/platform-server/ai-credits/math";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import { assertPublishedZoeBuildStandardPrice } from "./publishedModelPriceReviews";
import { assertZoeBuildOperationalBillingReadiness } from "./productionAiBillingReadiness";
import {
  deriveZoeBuildAttemptReservation,
  ZOEBUILD_VERIFIED_AI_BILLING_PROFILES,
  type ZoeBuildVerifiedAttemptPolicy,
} from "./verifiedAiCreditReservationPolicy";

/**
 * E16C4D3: exact-match, server-owned model billing registry.
 *
 * This does NOT discover or certify model prices. A record becomes eligible only
 * after an operator independently verifies provider terms, model limits, billing
 * categories, processing tier and all hidden-token/tool charges. Never populate
 * from a browser body, AI output or environment-supplied arbitrary JSON.
 *
 * Production registry starts EMPTY and thus refuses all paid model selections.
 */
export class ZoeBuildBillingRegistryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildBillingRegistryError";
  }
}

export type ZoeBuildBillingRegistry = Readonly<{
  profiles: readonly ZoeBuildVerifiedAttemptPolicy[];
}>;

/**
 * Use this only inside trusted server-owned billing composition. In production,
 * use resolveProductionZoeBuildBillingProfile (fixed compiled registry).
 */
export function resolveReviewedZoeBuildBillingProfile(input: Readonly<{
  registry: ZoeBuildBillingRegistry;
  candidate: BuildModelCandidate;
  occurredAt: Date;
}>): ZoeBuildVerifiedAttemptPolicy {
  const { registry, candidate, occurredAt } = input;
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ZoeBuildBillingRegistryError("AI_BILLING_TIME_INVALID");
  }
  // Fail closed on duplicate keys even if the two entries happen to be identical.
  // A fallback attempt must NEVER silently select a cheaper/incompatible price.
  const matches = registry.profiles.filter(profile =>
    profile.evidence.provider === candidate.provider &&
    profile.evidence.model === candidate.model);
  if (matches.length === 0) {
    throw new ZoeBuildBillingRegistryError("AI_BILLING_MODEL_NOT_REVIEWED");
  }
  if (matches.length !== 1) {
    throw new ZoeBuildBillingRegistryError("AI_BILLING_MODEL_REGISTRY_AMBIGUOUS");
  }
  const selected = matches[0]!;

  // Current rate arithmetic has one price schedule per candidate. GPT-6 Luna
  // and GPT-6.1 Sol have a separate long-context tier over 272K input tokens.
  // Without tier-specific request modeling we disallow those larger inputs.
  if (candidate.provider === "openai" &&
      (candidate.model === "gpt-6-luna" || candidate.model === "gpt-6.1-sol") &&
      selected.maxCombinedInputTokens > 272_000) {
    throw new ZoeBuildBillingRegistryError("AI_BILLING_LONG_CONTEXT_TIER_UNSUPPORTED");
  }

  // D2 validates evidence age, exact provider/model/price-version match,
  // inclusive input/output billable limits, and the resulting credit ceiling.
  deriveZoeBuildAttemptReservation({ candidate, policy: selected, occurredAt });
  return selected;
}

/** Only this entry point is allowed for production planning route composition. */
export function resolveProductionZoeBuildBillingProfile(
  candidate: BuildModelCandidate,
  occurredAt: Date = new Date(),
): ZoeBuildVerifiedAttemptPolicy {
  const policy = resolveReviewedZoeBuildBillingProfile({
    registry: { profiles: ZOEBUILD_VERIFIED_AI_BILLING_PROFILES },
    candidate,
    occurredAt,
  });
  // Commercial target is owner-approved, but no model/ops sign-off is implied.
  // Production requests must use the exact versioned cross-app conversion.
  assertZoeCommercialConversion(policy.conversion);
  // A D2 attestation does not prove the actual published rate matrix.
  // Independent D6 reviewed-source matching is mandatory for production.
  // No live profiles are registered, so this remains fail-closed by default.
  assertPublishedZoeBuildStandardPrice({candidate, policy, occurredAt});
  // D9: model pricing is necessary, NOT sufficient. Funding, credit conversion,
  // provider-account region, edit-route metering and uncertain-charge recovery
  // require their own independent source-controlled operational approval.
  // No such approvals exist yet, so production remains fail-closed.
  assertZoeBuildOperationalBillingReadiness({candidate, policy, occurredAt});
  return policy;
}
