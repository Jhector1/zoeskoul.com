import { describe, expect, it } from "vitest";
import { BOUNDED_LUNA_EDIT_CANDIDATE, BOUNDED_LUNA_EDIT_PROPOSAL,
  reviewBoundedLunaEditEconomics } from "./boundedLunaEditReviewV12J16";
import { resolveProductionZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";
import { ZOEBUILD_VERIFIED_AI_BILLING_PROFILES } from "./verifiedAiCreditReservationPolicy";
import { ZOEBUILD_APPROVED_BILLING_OPERATIONS } from "./productionAiBillingReadiness";
import { deriveZoeBuildAttemptReservation } from "./verifiedAiCreditReservationPolicy";

const at = new Date("2026-10-23T20:00:00.000Z");
describe("V12J.16A read-only bounded Luna editing economics", () => {
  it("prices the exact current four text token categories from the published review", () => {
    const price = BOUNDED_LUNA_EDIT_PROPOSAL.pricingCatalog[0]!;
    expect(price.provider).toBe("openai");
    expect(price.model).toBe("gpt-6-luna");
    expect(price.rates.map(rate => [rate.category,rate.usdPerMillionTokens])).toEqual([
      ["input","0.10"],["cached_input","0.01"],["cache_write","0.125"],["output","0.50"],
    ]);
  });
  it("computes worst-case input cache-write cost and hidden-output inclusive cap", () => {
    // Published prices were observed on October 24, so they cannot attest
    // a historical request on October 23. Preserve the fail-closed review.
    expect(() => reviewBoundedLunaEditEconomics(at)).toThrow("AI_BILLING_REVIEW_EXPIRED");
    // Separately exercise the historical, NONSPENDING cost calculator.
    // This does not establish a current price review or spending approval.
    const p = deriveZoeBuildAttemptReservation({
      candidate: BOUNDED_LUNA_EDIT_CANDIDATE,
      policy: BOUNDED_LUNA_EDIT_PROPOSAL,
      occurredAt: at,
    });
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.maxCombinedInputTokens).toBe(20_000);
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.maxBillableOutputTokens).toBe(4_096);
    expect(p.maximumCostUsdNano).toBe("4548000");
    // $0.004548 provider max, hypothetical 2x / 1 cent per credit -> 910 units ceiling.
    expect(p.maximumUnits).toBe("910");
  });
  it("blocks stale price and evidence instead of extending source attestations", () => {
    expect(() => reviewBoundedLunaEditEconomics(new Date("2026-10-27T00:00:01Z"))).toThrow();
    expect(() => reviewBoundedLunaEditEconomics(new Date("2026-10-22T00:00:00Z"))).toThrow();
  });
  it("cannot register a paid model or operational approval", () => {
    expect(ZOEBUILD_VERIFIED_AI_BILLING_PROFILES).toHaveLength(0);
    expect(ZOEBUILD_APPROVED_BILLING_OPERATIONS).toHaveLength(0);
    expect(() => resolveProductionZoeBuildBillingProfile(BOUNDED_LUNA_EDIT_CANDIDATE, at))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
  it("preserves the $5/500 credit pack conversion distinct from provider markups", () => {
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.conversion.creditUnitsPerCredit).toBe("1000");
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.conversion.creditValueUsdNano).toBe("10000000");
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.conversion.markupNumerator).toBe("2");
    expect(BOUNDED_LUNA_EDIT_PROPOSAL.conversion.markupDenominator).toBe("1");
  });
});
