import { describe, expect, it } from "vitest";
import type { AiPricingVersion } from "@zoeskoul/ai-json";
import {
  deriveZoeBuildAttemptReservation,
  ZOEBUILD_VERIFIED_AI_BILLING_PROFILES,
  type ZoeBuildVerifiedAttemptPolicy,
} from "./verifiedAiCreditReservationPolicy";

// Synthetic FIXTURE ONLY: these are not live provider rates or model limits.
const candidate = {provider: "openai" as const, model: "fixture-model", tier: "economy" as const, reason: "test"};
const at = new Date("2026-10-19T12:00:00Z");
const price: AiPricingVersion = {
  id: "fixture-price-1", provider: "openai", model: "fixture-model",
  effectiveFrom: "2026-10-01T00:00:00Z", currency: "USD",
  rates: [
    {category: "input", usdPerMillionTokens: "2"},
    {category: "output", usdPerMillionTokens: "8"},
    {category: "cached_input", usdPerMillionTokens: "0.5"},
    {category: "cache_write", usdPerMillionTokens: "0"},
  ],
};
const policy: ZoeBuildVerifiedAttemptPolicy = {
  pricingCatalog: [price], pricingVersionId: "fixture-price-1",
  maxCombinedInputTokens: 1000, maxOutputTokens: 1024, maxBillableOutputTokens: 1024,
  conversion: {versionId: "fixture-conversion-1", creditUnitsPerCredit: "1000",
    creditValueUsdNano: "10000000", markupNumerator: "1", markupDenominator: "1"},
  evidence: {
    sourceUrl: "https://platform.openai.com/docs/models",
    verifiedAt: "2026-10-18T12:00:00Z", verifierId: "unit-test-reviewer",
    provider: "openai", model: "fixture-model", pricingVersionId: "fixture-price-1",
    inputLimitCoversAllBilledInput: true, outputLimitCoversReasoningTokens: true,
    noOtherBillableFeatures: true,
  },
};
const derive = (
  p = policy,
  model: Parameters<typeof deriveZoeBuildAttemptReservation>[0]["candidate"] = candidate,
  time = at,
) =>
  deriveZoeBuildAttemptReservation({candidate: model, policy: p, occurredAt: time});

describe("E16C4D2 authoritative attempt-cost reservation policy", () => {
  it("fails closed by default: no live production billing profiles are preloaded", () => {
    expect(ZOEBUILD_VERIFIED_AI_BILLING_PROFILES).toEqual([]);
  });
  it("computes exact ceiling and credit reservation; never trusts a supplied maximumUnits", () => {
    const result = derive();
    expect(result.maximumCostUsdNano).toBe("10192000");
    expect(result.maximumUnits).toBe("1020");
    expect(result.pricingVersionId).toBe("fixture-price-1");
    expect(Object.hasOwn(policy, "maximumUnits")).toBe(false);
  });
  it("rejects a different candidate/provider/model or price revision", () => {
    expect(() => derive(policy, {...candidate, model: "different"})).toThrow("AI_BILLING_EVIDENCE_MISMATCH");
    expect(() => derive({...policy, pricingVersionId: "other"})).toThrow("AI_BILLING_EVIDENCE_MISMATCH");
    expect(() => derive({...policy, pricingCatalog: []})).toThrow("PRICE_VERSION_NOT_UNIQUE");
    expect(() => derive({...policy, pricingCatalog: [price, price]})).toThrow("PRICE_VERSION_NOT_UNIQUE");
  });
  it("rejects stale, future and untrusted documentary evidence", () => {
    expect(() => derive({...policy, evidence: {...policy.evidence, verifiedAt: "2026-10-01T00:00:00Z"}}))
      .toThrow("AI_BILLING_EVIDENCE_STALE");
    expect(() => derive({...policy, evidence: {...policy.evidence, verifiedAt: "2026-10-20T00:00:00Z"}}))
      .toThrow("AI_BILLING_EVIDENCE_STALE");
    expect(() => derive({...policy, evidence: {...policy.evidence, sourceUrl: "https://example.net/price"}}))
      .toThrow("AI_BILLING_EVIDENCE_SOURCE_INVALID");
    expect(() => derive({...policy, evidence: {...policy.evidence, sourceUrl: "http://platform.openai.com/price"}}))
      .toThrow("AI_BILLING_EVIDENCE_SOURCE_INVALID");
  });
  it("refuses missing inclusive token/billing proof", () => {
    expect(() => derive({...policy, evidence: {...policy.evidence, noOtherBillableFeatures: false as true}}))
      .toThrow("AI_BILLING_EVIDENCE_MISMATCH");
    expect(() => derive({...policy, evidence: {...policy.evidence, outputLimitCoversReasoningTokens: false as true}}))
      .toThrow("AI_BILLING_EVIDENCE_MISMATCH");
  });
  it("rejects invalid output cap and a lower reasoning-billable cap", () => {
    expect(() => derive({...policy, maxOutputTokens: 0})).toThrow("AI_JSON_OUTPUT_LIMIT_INVALID");
    expect(() => derive({...policy, maxBillableOutputTokens: 1023})).toThrow("AI_BILLING_REASONING_CAP_INVALID");
    expect(() => derive({...policy, maxBillableOutputTokens: 1025})).toThrow("AI_BILLING_REASONING_CAP_UNVERIFIED");
    expect(() => derive({...policy, maxCombinedInputTokens: 0})).toThrow("INVALID_INPUT_CEILING");
  });
  it("refuses Gemini policy even when supplied with synthetic pricing", () => {
    const gemini = {...candidate, provider: "gemini" as const};
    expect(() => derive({...policy, evidence: {...policy.evidence, provider: "gemini"}}, gemini))
      .toThrow("AI_BILLING_GEMINI_POLICY_UNVERIFIED");
  });
  it("rejects credit conversion that rounds to zero or overflows", () => {
    expect(() => derive({...policy, conversion: {...policy.conversion, markupNumerator: "0"}}))
      .toThrow("INVALID_MARKUP_NUMERATOR");
  });
});
