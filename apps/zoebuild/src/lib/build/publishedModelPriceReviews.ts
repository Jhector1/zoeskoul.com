import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import type { AiPricingVersion } from "@zoeskoul/ai-json";
type AiPriceCategory = AiPricingVersion["rates"][number]["category"];
import type { ZoeBuildVerifiedAttemptPolicy } from "./verifiedAiCreditReservationPolicy";

/**
 * E16C4D6: SOURCE-BACKED REVIEW SNAPSHOTS; NOT APPROVED BILLING PROFILES.
 * These are observed published Standard/global text-token list prices only.
 * No production model is registered or authorized by this file.
 *
 * Every snapshot expires after 7 days, must be independently reverified,
 * and must match an explicit server-owned price schedule byte-for-byte in value.
 * Future price changes require a reviewed source/code change, not an env var.
 */
export type ZoeBuildPublishedPriceReview = Readonly<{
  provider: "openai";
  model: string;
  sourceUrl: string;
  observedAt: string;
  processingTier: "default";
  region: "global";
  longContextStartsAboveInputTokens: number;
  maximumModelOutputTokens: number;
  rates: Readonly<Record<AiPriceCategory, string>>;
}>;

// Independently checked against the individual provider model pages on 2026-10-24.
// Snapshot of provider-published Standard/global rates, NOT a billing approval.
// Other processing tiers, data-residency premiums, tools and >272K input excluded.
// Listed rates are per 1,000,000 billed tokens, USD. No fee is guessed.
export const ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS: readonly ZoeBuildPublishedPriceReview[] = Object.freeze([
  Object.freeze({
    provider: "openai", model: "gpt-6-luna",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna",
    observedAt: "2026-10-24T00:00:00Z", processingTier: "default", region: "global",
    longContextStartsAboveInputTokens: 272_000, maximumModelOutputTokens: 128_000,
    rates: Object.freeze({input: "0.10", cached_input: "0.01", cache_write: "0.125", output: "0.50"}),
  }),
  Object.freeze({
    provider: "openai", model: "gpt-6.1-sol",
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6.1-sol",
    observedAt: "2026-10-24T00:00:00Z", processingTier: "default", region: "global",
    longContextStartsAboveInputTokens: 272_000, maximumModelOutputTokens: 128_000,
    rates: Object.freeze({input: "2.00", cached_input: "0.10", cache_write: "2.50", output: "10.00"}),
  }),
]);

export class ZoeBuildPublishedPriceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ZoeBuildPublishedPriceError";
  }
}

const CATEGORIES = ["input", "cached_input", "cache_write", "output"] as const;
const MAX_REVIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/;

function normalizedRate(rate: string): bigint {
  if (typeof rate !== "string" || !RATE_PATTERN.test(rate)) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_RATE_INVALID");
  }
  const [integer, fraction = ""] = rate.split(".");
  return BigInt(integer!) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}

/**
 * Validates that a candidate policy's ONE applicable price version matches
 * a freshly observed, provider-published model rate matrix. This does not
 * certify residency, cached-write mechanics, conversion, Stripe or route wiring.
 *
 * Production-only entry point calls this AFTER the independent D2/D3 checks.
 * Tests may supply an explicit review array; production always uses compiled
 * ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS rather than user/environment data.
 */
export function assertPublishedZoeBuildStandardPrice(input: Readonly<{
  candidate: BuildModelCandidate;
  policy: ZoeBuildVerifiedAttemptPolicy;
  occurredAt: Date;
  reviews?: readonly ZoeBuildPublishedPriceReview[];
}>): AiPricingVersion {
  const {candidate, policy, occurredAt} = input;
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_TIME_INVALID");
  }
  if (candidate.provider !== "openai") {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_PROVIDER_UNSUPPORTED");
  }
  const matches = (input.reviews ?? ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS)
    .filter(item => item.provider === candidate.provider && item.model === candidate.model);
  if (matches.length !== 1) {
    throw new ZoeBuildPublishedPriceError(matches.length === 0
      ? "AI_BILLING_REVIEW_MODEL_MISSING" : "AI_BILLING_REVIEW_AMBIGUOUS");
  }
  const review = matches[0]!;
  const observed = Date.parse(review.observedAt);
  const age = occurredAt.getTime() - observed;
  if (!Number.isFinite(observed) || age < 0 || age > MAX_REVIEW_AGE_MS) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_EXPIRED");
  }
  if (review.sourceUrl !== policy.evidence.sourceUrl ||
      review.processingTier !== "default" || review.region !== "global" ||
      !Number.isSafeInteger(review.longContextStartsAboveInputTokens) ||
      !Number.isSafeInteger(review.maximumModelOutputTokens) ||
      review.longContextStartsAboveInputTokens < 1 || review.maximumModelOutputTokens < 1) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_SCOPE_MISMATCH");
  }
  // Model-level caps and pricing-tier boundary. The actual request must also
  // pass independent input counting and the provider-enforced output cap.
  if (policy.maxCombinedInputTokens > review.longContextStartsAboveInputTokens ||
      policy.maxOutputTokens > review.maximumModelOutputTokens ||
      policy.maxBillableOutputTokens > review.maximumModelOutputTokens) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_CONTEXT_TIER_UNSUPPORTED");
  }
  const active = policy.pricingCatalog.filter(price =>
    price.provider === candidate.provider && price.model === candidate.model &&
    Date.parse(price.effectiveFrom) <= occurredAt.getTime() &&
    (price.effectiveUntil === undefined || occurredAt.getTime() < Date.parse(price.effectiveUntil)));
  if (active.length !== 1 || active[0]!.id !== policy.pricingVersionId) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_PRICE_VERSION_MISMATCH");
  }
  const price = active[0]!;
  // Never assert that the observed 2026-10-24 rate applied historically.
  if (price.currency !== "USD" || Date.parse(price.effectiveFrom) < observed ||
      !Number.isFinite(Date.parse(price.effectiveFrom))) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_PRICE_DATE_INVALID");
  }
  if (price.rates.length !== CATEGORIES.length) {
    throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_RATE_MATRIX_MISMATCH");
  }
  const given = new Map<AiPriceCategory, string>();
  for (const rate of price.rates) {
    if (!CATEGORIES.includes(rate.category) || given.has(rate.category)) {
      throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_RATE_MATRIX_MISMATCH");
    }
    given.set(rate.category, rate.usdPerMillionTokens);
  }
  for (const category of CATEGORIES) {
    const actual = given.get(category);
    if (actual === undefined || normalizedRate(actual) !== normalizedRate(review.rates[category])) {
      throw new ZoeBuildPublishedPriceError("AI_BILLING_REVIEW_RATE_MATRIX_MISMATCH");
    }
  }
  return price;
}
