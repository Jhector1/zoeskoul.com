import { describe, expect, it } from "vitest";
import type { BuildModelCandidate } from "@zoeskoul/build-routing";
import type { ZoeBuildVerifiedAttemptPolicy } from "./verifiedAiCreditReservationPolicy";
import { resolveProductionZoeBuildBillingProfile } from "./reviewedAiBillingRegistry";
import {
  assertZoeBuildOperationalBillingReadiness,
  ZOEBUILD_APPROVED_BILLING_OPERATIONS,
  type ZoeBuildOperationalBillingReview,
} from "./productionAiBillingReadiness";

const at = new Date("2026-10-19T18:00:00Z");
const model: BuildModelCandidate = {
  provider: "openai", model: "gpt-6-luna", tier: "economy", reason: "test",
};
const other: BuildModelCandidate = { ...model, model: "gpt-6.1-sol" };
const policy = {
  pricingVersionId: "reviewed-price-id",
  conversion: {versionId: "reviewed-conversion-id"},
} as ZoeBuildVerifiedAttemptPolicy;
const evidenceRefs: ZoeBuildOperationalBillingReview["evidenceRefs"] = {
  providerAccountRegion: "audit:provider-region:20261019",
  creditConversionEconomics: "audit:conversion-terms:20261019",
  verifiedFundingAndReversals: "audit:funding-and-reversals:20261019",
  uncertainChargeReconciliation: "audit:reconciliation:20261019",
  generationAndEditRouteEnforcement: "audit:routes-and-edit:20261019",
  billingOperationsAndAudit: "audit:operations-monitoring:20261019",
};
// Test fixture ONLY: these fake audit references are NOT proof of readiness.
const review: ZoeBuildOperationalBillingReview = {
  provider: "openai", model: model.model,
  pricingVersionId: policy.pricingVersionId,
  conversionVersionId: policy.conversion.versionId,
  reviewedAt: "2026-10-19T17:00:00Z", reviewerId: "unit-reviewer",
  processingTier: "default", processingEndpoint: "https://api.openai.com/v1",
  regionScope: "global", evidenceRefs,
};
const check = (candidate = model, records: readonly ZoeBuildOperationalBillingReview[] = [review],
  current = at, spend = policy) => assertZoeBuildOperationalBillingReadiness({
    candidate, policy: spend, occurredAt: current, reviews: records,
  });

describe("E16C4D9 independently reviewed operational sign-off (not activation)", () => {
  it("keeps BOTH registries empty and production model resolution disabled", () => {
    expect(ZOEBUILD_APPROVED_BILLING_OPERATIONS).toHaveLength(0);
    for (const candidate of [model, other]) {
      expect(() => resolveProductionZoeBuildBillingProfile(candidate, at))
        .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
    }
  });
  it("rejects missing or duplicate operational approvals", () => {
    expect(() => check(model, [])).toThrow("AI_BILLING_OPERATIONS_NOT_APPROVED");
    expect(() => check(model, [review, {...review}])).toThrow("AI_BILLING_OPERATIONS_AMBIGUOUS");
  });
  it("never shares one model's audit with a different model or provider", () => {
    expect(() => check(other)).toThrow("AI_BILLING_OPERATIONS_NOT_APPROVED");
    expect(() => check({...model, provider: "gemini"})).toThrow("AI_BILLING_OPERATIONS_PROVIDER_UNSUPPORTED");
  });
  it("checks exact price AND conversion versions", () => {
    expect(() => check(model, [{...review, pricingVersionId: "different"}]))
      .toThrow("AI_BILLING_OPERATIONS_SCOPE_MISMATCH");
    expect(() => check(model, [{...review, conversionVersionId: "different"}]))
      .toThrow("AI_BILLING_OPERATIONS_SCOPE_MISMATCH");
  });
  it("refuses regional/premium endpoint and tier attestations", () => {
    for (const changed of [
      {...review, processingEndpoint: "https://eu.api.openai.com/v1" as "https://api.openai.com/v1"},
      {...review, processingTier: "priority" as "default"},
      {...review, regionScope: "eu" as "global"},
    ]) expect(() => check(model, [changed]))
      .toThrow("AI_BILLING_OPERATIONS_SCOPE_MISMATCH");
  });
  it("rejects future, expired, malformed and invalid review times", () => {
    expect(() => check(model, [review], new Date("2026-10-26T17:00:01Z")))
      .toThrow("AI_BILLING_OPERATIONS_REVIEW_STALE");
    expect(() => check(model, [review], new Date("2026-10-19T16:59:59Z")))
      .toThrow("AI_BILLING_OPERATIONS_REVIEW_STALE");
    expect(() => check(model, [review], new Date("invalid")))
      .toThrow("AI_BILLING_OPERATIONS_TIME_INVALID");
    expect(() => check(model, [{...review, reviewedAt: "not-a-date"}]))
      .toThrow("AI_BILLING_OPERATIONS_REVIEW_STALE");
  });
  it("requires independent references for funding, reversals and reconciliation", () => {
    for (const field of Object.keys(evidenceRefs) as (keyof typeof evidenceRefs)[]) {
      const changed = {...evidenceRefs, [field]: ""};
      expect(() => check(model, [{...review, evidenceRefs: changed}]))
        .toThrow("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
    }
  });
  it("refuses duplicated, malformed or secret-like audit IDs", () => {
    expect(() => check(model, [{...review, evidenceRefs: {...evidenceRefs,
      verifiedFundingAndReversals: evidenceRefs.uncertainChargeReconciliation}}]))
      .toThrow("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
    expect(() => check(model, [{...review, evidenceRefs: {...evidenceRefs,
      creditConversionEconomics: "secret value with spaces"}}]))
      .toThrow("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
  });
  it("rejects missing evidence and an invalid reviewer", () => {
    expect(() => check(model, [{...review, evidenceRefs: undefined as never}]))
      .toThrow("AI_BILLING_OPERATIONS_EVIDENCE_INCOMPLETE");
    expect(() => check(model, [{...review, reviewerId: ""}]))
      .toThrow("AI_BILLING_OPERATIONS_REVIEWER_INVALID");
  });
  it("accepts a fully shaped synthetic REVIEW for unit-test purposes only", () => {
    expect(check()).toBe(review);
    // This fixture is passed only to the pure validator. It does NOT populate
    // the compiled allowlist or enable a provider call/production credit spend.
    expect(ZOEBUILD_APPROVED_BILLING_OPERATIONS).toHaveLength(0);
  });
});
