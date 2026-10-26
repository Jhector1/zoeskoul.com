import { describe, it, expect } from "vitest";
import { assertZoeReviewedCreditPackCoverage } from "./zoeReviewedCreditEconomics";

// Synthetic fixture, NOT a reviewed live Stripe price or model conversion.
const conversion = {versionId:"fixture-v1",creditUnitsPerCredit:"1000",
  creditValueUsdNano:"10000000",markupNumerator:"125",markupDenominator:"100"};
const pack = {amountUsdMinor:500,creditUnits:"500000",
  processorFeeMaximumUsdNano:"500000000",requiredMarginUsdNano:"300000000",conversion};

describe("V12J.19 exact credit pack economic coverage",()=>{
  it("calculates conservative provider liability without floating point",()=>{
    const actual=assertZoeReviewedCreditPackCoverage(pack);
    expect(actual).toEqual({revenueUsdNano:"5000000000",
      maximumProviderLiabilityUsdNano:"4000000000",
      processorFeeMaximumUsdNano:"500000000",requiredMarginUsdNano:"300000000",
      minimumSurplusUsdNano:"500000000"});
  });
  it("rejects loss-making credit packs or unreviewed fee/margin assumptions",()=>{
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,amountUsdMinor:350}))
      .toThrow("AI_CREDIT_ECONOMICS_INSUFFICIENT_COVERAGE");
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,processorFeeMaximumUsdNano:""}))
      .toThrow("AI_CREDIT_ECONOMICS_PROCESSOR_FEE_INVALID");
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,requiredMarginUsdNano:"-1"}))
      .toThrow("AI_CREDIT_ECONOMICS_MARGIN_INVALID");
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,creditUnits:"500000.5"}))
      .toThrow("AI_CREDIT_ECONOMICS_FUNDED_UNITS_INVALID");
  });
  it("rejects invalid conversions and numeric overflow",()=>{
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,conversion:{...conversion,markupNumerator:"0"}}))
      .toThrow("INVALID_MARKUP_NUMERATOR");
    expect(()=>assertZoeReviewedCreditPackCoverage({...pack,creditUnits:"99999999999999999999999"}))
      .toThrow("AI_CREDIT_ECONOMICS_FUNDED_UNITS_OUT_OF_RANGE");
  });
  it("does not treat a sandbox pack or test fixture as live approval",()=>{
    // This helper exports only math: no Stripe checkout, grant, registry edit,
    // or operation approval can be inferred from its output.
    expect(assertZoeReviewedCreditPackCoverage(pack).minimumSurplusUsdNano).toBe("500000000");
  });
});
