import {describe,it,expect} from "vitest";
import {
  ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET as target,
  assertZoeCommercialConversion,assertZoeCommercialPack,
  providerNanoUsdToCreditUnits,
} from "./creditMath";
import {evaluateZoeOwnerApprovedCommercialTarget} from "./zoeReviewedCreditEconomics";

describe("V12J.25 owner-approved target, not live activation",()=>{
  it("records exactly $5, 500 credits and 500000 ledger units",()=>{
    expect(target.status).toBe("owner-approved-target");
    expect(target.amountUsdMinor).toBe(500);
    expect(target.customerCredits).toBe(500);
    expect(target.creditUnits).toBe("500000");
    expect(BigInt(target.creditUnits)/BigInt(target.conversion.creditUnitsPerCredit)).toBe(500n);
  });
  it("rounds the 2x provider cost up, using canonical precision",()=>{
    expect(providerNanoUsdToCreditUnits("10000000",target.conversion)).toBe(2000n);
    expect(providerNanoUsdToCreditUnits("1",target.conversion)).toBe(1n);
    expect(providerNanoUsdToCreditUnits("0",target.conversion)).toBe(0n);
  });
  it("uses a stable immutable conversion version",()=>{
    expect(Object.isFrozen(target)).toBe(true);
    expect(Object.isFrozen(target.conversion)).toBe(true);
    expect(target.conversion.versionId).toBe("zoebuild-v12j25-owner-approved-v1");
    expect(()=>assertZoeCommercialConversion(target.conversion)).not.toThrow();
  });
  it("rejects hidden markup changes, factor changes, and reusing another version",()=>{
    for(const change of [
      {markupNumerator:"1"},{creditValueUsdNano:"20000000"},
      {creditUnitsPerCredit:"999"},{versionId:"alternate-v1"},
      {markupDenominator:"2"},
    ])expect(()=>assertZoeCommercialConversion({...target.conversion,...change}))
      .toThrow("AI_CREDIT_COMMERCIAL_CONVERSION_MISMATCH");
  });
  it("requires $5 AND exactly 500000 credit units for the proposed live pack",()=>{
    expect(()=>assertZoeCommercialPack({amountUsdMinor:500,creditUnits:"500000"})).not.toThrow();
    expect(()=>assertZoeCommercialPack({amountUsdMinor:1000,creditUnits:"500000"})).toThrow("AI_CREDIT_COMMERCIAL_PACK_MISMATCH");
    expect(()=>assertZoeCommercialPack({amountUsdMinor:500,creditUnits:"500001"})).toThrow("AI_CREDIT_COMMERCIAL_PACK_MISMATCH");
  });
  it("calculates exact $2.50 maximum provider liability and $1.75 surplus",()=>{
    const result=evaluateZoeOwnerApprovedCommercialTarget();
    expect(result.revenueUsdNano).toBe("5000000000");
    expect(result.maximumProviderLiabilityUsdNano).toBe("2500000000");
    expect(result.processorFeeMaximumUsdNano).toBe("750000000");
    expect(result.requiredMarginUsdNano).toBe("250000000");
    expect(result.minimumSurplusUsdNano).toBe("1750000000");
    expect(result.surplusBeyondRequiredMarginUsdNano).toBe("1500000000");
  });
  it("does not pretend the user's target approves the merchant fee or live Stripe",()=>{
    const result=evaluateZoeOwnerApprovedCommercialTarget();
    expect(result.merchantFeesIndependentlyVerified).toBe(false);
    expect(result.liveStripePriceApproved).toBe(false);
    expect(result.operationalReleaseApproved).toBe(false);
  });
  it("protects against editing the conversion or pack without policy review",()=>{
    expect(target.processorFeeAllowanceUsdNano).toBe("750000000");
    expect(target.minimumRequiredMarginUsdNano).toBe("250000000");
  });
});
