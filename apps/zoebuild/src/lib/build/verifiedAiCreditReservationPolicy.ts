import {
  boundedAiJsonOutputTokens,
  calculateAiTextTokenCeiling,
  type AiPricingVersion,
} from "@zoeskoul/ai-json";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import {
  providerNanoUsdToCreditUnits,
  type AiCreditConversion,
} from "@zoeskoul/platform-server/ai-credits/math";

/**
 * E16C4D2: an audited, SERVER-ONLY model-billing profile. This object must
 * originate in a reviewed billing registry, never a browser or LLM response.
 * An evidence URL/attestation is a review record, NOT proof by itself.
 * Product owners must verify provider context/window semantics and all fees.
 */
export type VerifiedAiBillingEvidence = Readonly<{
  sourceUrl: string;
  verifiedAt: string;
  verifierId: string;
  provider: BuildModelCandidate["provider"];
  model: string;
  pricingVersionId: string;
  inputLimitCoversAllBilledInput: true;
  outputLimitCoversReasoningTokens: true;
  noOtherBillableFeatures: true;
}>;

export type ZoeBuildVerifiedAttemptPolicy = Readonly<{
  pricingCatalog: readonly AiPricingVersion[];
  pricingVersionId: string;
  conversion: AiCreditConversion;
  /** Maximum billable input tokens guaranteed by the provider model contract. */
  maxCombinedInputTokens: number;
  /** Provider-enforced response API cap. */
  maxOutputTokens: number;
  /** Provider-guaranteed max including hidden reasoning / thinking tokens. */
  maxBillableOutputTokens: number;
  evidence: VerifiedAiBillingEvidence;
}>;

export type ZoeBuildDerivedSpendPolicy = Readonly<{
  pricingCatalog: readonly AiPricingVersion[];
  pricingVersionId: string;
  conversion: AiCreditConversion;
  maxOutputTokens: number;
  maximumUnits: string;
  maximumCostUsdNano: string;
}>;

export class ZoeBuildReservationPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildReservationPolicyError";
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_DOMAINS: Readonly<Record<BuildModelCandidate["provider"], readonly string[]>> = {
  openai: ["openai.com"],
  claude: ["anthropic.com"],
  deepseek: ["deepseek.com"],
  gemini: ["google.com", "ai.google.dev"],
};

function verifiedEvidence(
  candidate: BuildModelCandidate,
  policy: ZoeBuildVerifiedAttemptPolicy,
  occurredAt: Date,
): void {
  const proof = policy.evidence;
  if (proof.provider !== candidate.provider || proof.model !== candidate.model ||
      proof.pricingVersionId !== policy.pricingVersionId ||
      !proof.inputLimitCoversAllBilledInput ||
      !proof.outputLimitCoversReasoningTokens ||
      !proof.noOtherBillableFeatures ||
      !proof.verifierId.trim() || proof.verifierId.length > 160) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_EVIDENCE_MISMATCH");
  }
  let source: URL;
  try {
    source = new URL(proof.sourceUrl);
  } catch {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_EVIDENCE_SOURCE_INVALID");
  }
  if (source.protocol !== "https:" || !PROVIDER_DOMAINS[candidate.provider].some((domain) =>
    source.hostname === domain || source.hostname.endsWith(`.${domain}`))) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_EVIDENCE_SOURCE_INVALID");
  }
  const verified = Date.parse(proof.verifiedAt);
  const elapsed = occurredAt.getTime() - verified;
  if (!Number.isFinite(verified) || !Number.isFinite(elapsed) ||
      elapsed < 0 || elapsed > SEVEN_DAYS_MS) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_EVIDENCE_STALE");
  }
}

/**
 * Convert the MOST expensive permitted text-token scenario to a reservation.
 * Never accept a manually nominated number of credits from the API or planner.
 * Only a separately reviewed server registry may supply the profile/prices.
 */
export function deriveZoeBuildAttemptReservation(input: Readonly<{
  candidate: BuildModelCandidate;
  policy: ZoeBuildVerifiedAttemptPolicy;
  occurredAt: Date;
}>): ZoeBuildDerivedSpendPolicy {
  const { candidate, policy, occurredAt } = input;
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_TIME_INVALID");
  }
  if (candidate.provider === "gemini") {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_GEMINI_POLICY_UNVERIFIED");
  }
  if (boundedAiJsonOutputTokens({system: "", user: "", schemaName: "", maxOutputTokens: policy.maxOutputTokens}) === undefined) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_OUTPUT_LIMIT_MISSING");
  }
  if (!Number.isSafeInteger(policy.maxBillableOutputTokens) ||
      policy.maxBillableOutputTokens < policy.maxOutputTokens) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_REASONING_CAP_INVALID");
  }
  // For the current provider transport, API output cap includes reasoning.
  // A policy claiming additional billable output above the enforced cap
  // is not backed by an enforceable transport budget.
  if (policy.maxBillableOutputTokens !== policy.maxOutputTokens) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_REASONING_CAP_UNVERIFIED");
  }
  verifiedEvidence(candidate, policy, occurredAt);
  const ceiling = calculateAiTextTokenCeiling({
    provider: candidate.provider,
    model: candidate.model,
    catalog: policy.pricingCatalog,
    occurredAt: occurredAt.toISOString(),
    maxCombinedInputTokens: policy.maxCombinedInputTokens,
    maxBillableOutputTokens: policy.maxBillableOutputTokens,
  });
  if (ceiling.pricingVersionId !== policy.pricingVersionId) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_PRICE_VERSION_MISMATCH");
  }
  const maximumUnits = providerNanoUsdToCreditUnits(ceiling.costUsdNano, policy.conversion);
  if (maximumUnits < 1n) {
    throw new ZoeBuildReservationPolicyError("AI_BILLING_ZERO_UNIT_RESERVATION");
  }
  return {
    pricingCatalog: policy.pricingCatalog,
    pricingVersionId: policy.pricingVersionId,
    conversion: policy.conversion,
    maxOutputTokens: policy.maxOutputTokens,
    maximumUnits: maximumUnits.toString(),
    maximumCostUsdNano: ceiling.costUsdNano,
  };
}

/**
 * No production profiles until independently reviewed current model pricing,
 * tool/media fees, and input/output enforcement guarantees are registered.
 */
export const ZOEBUILD_VERIFIED_AI_BILLING_PROFILES: readonly ZoeBuildVerifiedAttemptPolicy[] = Object.freeze([]);
