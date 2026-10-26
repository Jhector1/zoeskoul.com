import {describe, expect, it} from "vitest";
import type {BuildModelCandidate} from "@zoeskoul/build-routing";
import type {ZoeBuildVerifiedAttemptPolicy} from "./verifiedAiCreditReservationPolicy";
import {
  assertPublishedZoeBuildStandardPrice,
  ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS,
} from "./publishedModelPriceReviews";
import {resolveProductionZoeBuildBillingProfile} from "./reviewedAiBillingRegistry";

const at = new Date("2026-10-24T18:00:00Z");
const luna: BuildModelCandidate = {provider:"openai", model:"gpt-6-luna", tier:"economy", reason:"test"};
const sol: BuildModelCandidate = {...luna, model:"gpt-6.1-sol"};
const make = (candidate: BuildModelCandidate): ZoeBuildVerifiedAttemptPolicy => {
  const review = ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS.find(r=>r.model === candidate.model)!;
  const version = `observed:${review.model}:2026-10-24`;
  return {
    pricingVersionId: version,
    pricingCatalog: [{
      id: version, provider: "openai", model: candidate.model,
      effectiveFrom: review.observedAt, currency:"USD",
      rates: Object.entries(review.rates).map(([category, usdPerMillionTokens])=>({
        category: category as ZoeBuildVerifiedAttemptPolicy["pricingCatalog"][number]["rates"][number]["category"],
        usdPerMillionTokens,
      })),
    }],
    maxCombinedInputTokens: 272_000,
    maxOutputTokens: 4096,
    maxBillableOutputTokens: 4096,
    conversion: {versionId:"fixture-conversion", creditUnitsPerCredit:"1000",
      creditValueUsdNano:"1000000000", markupNumerator:"1", markupDenominator:"1"},
    evidence: {provider:"openai", model:candidate.model, pricingVersionId:version,
      sourceUrl:review.sourceUrl, verifiedAt:"2026-10-24T17:00:00Z", verifierId:"test-reviewer",
      inputLimitCoversAllBilledInput:true, outputLimitCoversReasoningTokens:true,
      noOtherBillableFeatures:true},
  };
};
const check = (candidate = luna, policy = make(candidate), occurredAt = at) =>
  assertPublishedZoeBuildStandardPrice({candidate,policy,occurredAt});

describe("E16C4D6 published Standard price review (not activation)",()=>{
  it("records the 2026-10-24 official Luna and Sol rates distinctly",()=>{
    expect(ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS).toHaveLength(2);
    expect(ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS[0]?.rates).toEqual({
      input:"0.10", cached_input:"0.01", cache_write:"0.125", output:"0.50"});
    expect(ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS[1]?.rates).toEqual({
      input:"2.00", cached_input:"0.10", cache_write:"2.50", output:"10.00"});
  });
  it("matches exactly reviewed model, source and all four billable categories",()=>{
    expect(check().model).toBe("gpt-6-luna");
    expect(check(sol,make(sol)).model).toBe("gpt-6.1-sol");
  });
  it("accepts numeric-equivalent decimal strings, never floating-point conversion",()=>{
    const policy=make(luna);
    const price=policy.pricingCatalog[0]!;
    expect(check(luna,{...policy,pricingCatalog:[{...price,
      rates:price.rates.map(r=>r.category==="input"?{...r,usdPerMillionTokens:"0.1000"}:r)}]})).toBeDefined();
  });
  it("blocks a one-cent rate decrease OR increase instead of silently using stale pricing",()=>{
    const policy=make(luna);
    const price=policy.pricingCatalog[0]!;
    for (const altered of ["0.09", "0.11"]) {
      expect(()=>check(luna,{...policy,pricingCatalog:[{...price,
        rates:price.rates.map(r=>r.category==="input"?{...r,usdPerMillionTokens:altered}:r)}]}))
        .toThrow("AI_BILLING_REVIEW_RATE_MATRIX_MISMATCH");
    }
  });
  it("detects differences in cache write and output prices",()=>{
    const policy=make(sol);
    const price=policy.pricingCatalog[0]!;
    for(const category of ["cache_write", "cached_input", "output"]){
      expect(()=>check(sol,{...policy,pricingCatalog:[{...price,
        rates:price.rates.map(r=>r.category===category?{...r,usdPerMillionTokens:"0"}:r)}]}))
        .toThrow("AI_BILLING_REVIEW_RATE_MATRIX_MISMATCH");
    }
  });
  it("rejects missing, duplicate, extra and malformed rate categories",()=>{
    const policy=make(luna);
    const price=policy.pricingCatalog[0]!;
    for(const rates of [price.rates.slice(1), [...price.rates,price.rates[0]!],
      price.rates.map((r,i)=>i===0?{...r,usdPerMillionTokens:"NaN"}:r)]) {
      expect(()=>check(luna,{...policy,pricingCatalog:[{...price,rates}]})).toThrow();
    }
  });
  it("rejects non-global or non-standard reviews and mismatching document sources",()=>{
    const policy=make(luna);
    const original=ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS[0]!;
    for(const changed of [{...original,region:"eu" as "global"},
      {...original,processingTier:"fast" as "default"}]){
      expect(()=>assertPublishedZoeBuildStandardPrice({candidate:luna,policy,occurredAt:at,reviews:[changed]}))
        .toThrow("AI_BILLING_REVIEW_SCOPE_MISMATCH");
    }
    expect(()=>check(luna,{...policy,evidence:{...policy.evidence,
      sourceUrl:"https://example.com/pricing"}})).toThrow("AI_BILLING_REVIEW_SCOPE_MISMATCH");
  });
  it("rejects unreviewed models, non-OpenAI models and ambiguous reviews",()=>{
    expect(()=>check({...luna,model:"unreviewed"},make(luna)))
      .toThrow("AI_BILLING_REVIEW_MODEL_MISSING");
    expect(()=>check({...luna,provider:"gemini"},make(luna)))
      .toThrow("AI_BILLING_REVIEW_PROVIDER_UNSUPPORTED");
    const review=ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS[0]!;
    expect(()=>assertPublishedZoeBuildStandardPrice({candidate:luna,policy:make(luna),occurredAt:at,
      reviews:[review,review]})).toThrow("AI_BILLING_REVIEW_AMBIGUOUS");
  });
  it("expires after seven days and refuses a future review",()=>{
    expect(()=>check(luna,make(luna),new Date("2026-10-31T00:00:01Z")))
      .toThrow("AI_BILLING_REVIEW_EXPIRED");
    expect(()=>check(luna,make(luna),new Date("2026-10-23T00:00:00Z")))
      .toThrow("AI_BILLING_REVIEW_EXPIRED");
  });
  it("never applies short-context prices to a long-context or oversized output request",()=>{
    const policy=make(luna);
    for(const modified of [{...policy,maxCombinedInputTokens:272_001},
      {...policy,maxOutputTokens:128_001},
      {...policy,maxBillableOutputTokens:128_001}]){
      expect(()=>check(luna,modified)).toThrow("AI_BILLING_REVIEW_CONTEXT_TIER_UNSUPPORTED");
    }
  });
  it("refuses price versions effective before observation or not active",()=>{
    const policy=make(luna); const price=policy.pricingCatalog[0]!;
    expect(()=>check(luna,{...policy,pricingCatalog:[{...price,
      effectiveFrom:"2026-09-01T00:00:00Z"}]})).toThrow("AI_BILLING_REVIEW_PRICE_DATE_INVALID");
    expect(()=>check(luna,{...policy,pricingCatalog:[{...price,
      effectiveFrom:"2026-10-25T00:00:00Z"}]})).toThrow("AI_BILLING_REVIEW_PRICE_VERSION_MISMATCH");
    expect(()=>check(luna,{...policy,pricingVersionId:"wrong"}))
      .toThrow("AI_BILLING_REVIEW_PRICE_VERSION_MISMATCH");
  });
  it("still has no production approval even with published rates present",()=>{
    expect(()=>resolveProductionZoeBuildBillingProfile(luna,at))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
});
