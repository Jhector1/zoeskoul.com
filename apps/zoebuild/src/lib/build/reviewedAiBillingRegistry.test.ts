import { describe, expect, it } from "vitest";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import type { ZoeBuildVerifiedAttemptPolicy } from "./verifiedAiCreditReservationPolicy";
import {
  resolveProductionZoeBuildBillingProfile,
  resolveReviewedZoeBuildBillingProfile,
} from "./reviewedAiBillingRegistry";

// Synthetic test-only pricing. Never register these rates for production.
const candidate: BuildModelCandidate = {
  provider: "openai", model: "gpt-6-luna", tier: "economy", reason: "test",
};
const now = new Date("2026-10-19T16:00:00.000Z");
const policy: ZoeBuildVerifiedAttemptPolicy = {
  pricingCatalog: [{
    id: "fixture-price", provider: "openai", model: "gpt-6-luna",
    effectiveFrom: "2026-10-01T00:00:00Z", currency: "USD",
    rates: [
      { category: "input", usdPerMillionTokens: "2" },
      { category: "cached_input", usdPerMillionTokens: "0.5" },
      { category: "cache_write", usdPerMillionTokens: "0" },
      { category: "output", usdPerMillionTokens: "8" },
    ],
  }],
  pricingVersionId: "fixture-price",
  conversion: {
    versionId: "fixture-conversion", creditUnitsPerCredit: "1000",
    creditValueUsdNano: "10000000", markupNumerator: "1", markupDenominator: "1",
  },
  maxCombinedInputTokens: 1000,
  maxOutputTokens: 1024,
  maxBillableOutputTokens: 1024,
  evidence: {
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna",
    verifiedAt: "2026-10-19T15:00:00.000Z",
    verifierId: "fixture-reviewer", provider: "openai", model: "gpt-6-luna",
    pricingVersionId: "fixture-price",
    inputLimitCoversAllBilledInput: true,
    outputLimitCoversReasoningTokens: true,
    noOtherBillableFeatures: true,
  },
};
const resolve = (profiles: readonly ZoeBuildVerifiedAttemptPolicy[],
  model: BuildModelCandidate = candidate, at = now) =>
  resolveReviewedZoeBuildBillingProfile({ registry: { profiles }, candidate: model, occurredAt: at });

describe("E16C4D3 exact-match reviewed AI billing registry", () => {
  it("keeps the production registry EMPTY, blocking paid models by default", () => {
    expect(() => resolveProductionZoeBuildBillingProfile(candidate, now))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
  it("returns an exact server-reviewed profile without altering its pricing", () => {
    expect(resolve([policy])).toBe(policy);
  });
  it("refuses an unreviewed model, including fallback or manual override", () => {
    expect(() => resolve([policy], { ...candidate, model: "unreviewed" }))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
    expect(() => resolve([policy], { ...candidate, provider: "claude" }))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
  it("rejects duplicate approved model keys instead of picking the first", () => {
    expect(() => resolve([policy, { ...policy }]))
      .toThrow("AI_BILLING_MODEL_REGISTRY_AMBIGUOUS");
  });
  it("rejects unsupported long-context price tiers", () => {
    expect(() => resolve([{ ...policy, maxCombinedInputTokens: 272_001 }]))
      .toThrow("AI_BILLING_LONG_CONTEXT_TIER_UNSUPPORTED");
  });
  it("checks the underlying evidence and exact active price revision", () => {
    expect(() => resolve([{ ...policy, evidence: { ...policy.evidence,
      verifiedAt: "2026-09-01T00:00:00Z" } }]))
      .toThrow("AI_BILLING_EVIDENCE_STALE");
    expect(() => resolve([{ ...policy, pricingCatalog: [] }]))
      .toThrow("PRICE_VERSION_NOT_UNIQUE");
  });
  it("rejects an unbounded/bad output policy before provider dispatch", () => {
    expect(() => resolve([{ ...policy, maxOutputTokens: 0 }]))
      .toThrow("AI_JSON_OUTPUT_LIMIT_INVALID");
  });
});
