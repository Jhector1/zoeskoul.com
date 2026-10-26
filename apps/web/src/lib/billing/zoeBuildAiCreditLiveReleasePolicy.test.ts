import {describe,it,expect} from "vitest";
import {
  assertZoeBuildLivePackReleased, ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS,
} from "./zoeBuildAiCreditLiveReleasePolicy";
import {ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET as target} from
  "@zoeskoul/platform-server/ai-credits/math";

// Synthetic reviewer record ONLY for unit tests; never compiled into runtime approvals.
const time=new Date("2026-10-24T18:00:00Z");
const pack={priceId:"price_fixture_verified",amountUsdMinor:500,creditUnits:"500000"};
const evidenceRefs={
  stripeLivePrice:"review/stripe-price-20261024",
  merchantProcessingFees:"review/merchant-fees-20261024",
  paymentMethodsAndTaxes:"review/taxes-and-methods-20261024",
  refundsDisputesReconciliation:"review/financial-recovery-20261024",
  requiredMeteringAndResultRecovery:"review/ai-metering-20261024",
  alertsAuditAndIncidentResponse:"review/incident-response-20261024",
};
const reviewed={...pack,conversionVersionId:target.conversion.versionId,
  currency:"usd" as const,processorFeeUpperBoundUsdNano:"750000000",
  reviewedAt:"2026-10-24T17:00:00Z",reviewerId:"fixture-reviewer",evidenceRefs};
const approve=(review=reviewed,at=time)=>assertZoeBuildLivePackReleased({
  pack,reviews:[review],occurredAt:at,
});

describe("V12J.26 independent live release gate (no real approvals)",()=>{
  it("keeps reviewed live records empty",()=>{
    expect(ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS).toHaveLength(0);
  });
  it("a matching synthetic review proves only shape and arithmetic",()=>{
    expect(approve()).toEqual(reviewed);
  });
  it("the owner-approved $5/500 target is still required",()=>{
    expect(()=>assertZoeBuildLivePackReleased({pack:{...pack,amountUsdMinor:600},
      reviews:[reviewed],occurredAt:time})).toThrow("AI_CREDIT_COMMERCIAL_PACK_MISMATCH");
  });
  it("rejects a missing, duplicate or mismatched live approval",()=>{
    expect(()=>assertZoeBuildLivePackReleased({pack,reviews:[],occurredAt:time}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_NOT_APPROVED");
    expect(()=>assertZoeBuildLivePackReleased({pack,reviews:[reviewed,reviewed],occurredAt:time}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_AMBIGUOUS");
    expect(()=>approve({...reviewed,conversionVersionId:"different-v1"}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_SCOPE_MISMATCH");
  });
  it("rejects fee ceiling above the reviewed allowance and missing fees",()=>{
    expect(()=>approve({...reviewed,processorFeeUpperBoundUsdNano:"750000001"}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_FEE_EXCEEDS_ALLOWANCE");
    expect(()=>approve({...reviewed,processorFeeUpperBoundUsdNano:"0"}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_FEE_UNVERIFIED");
  });
  it("review is time bounded and cannot be dated in future",()=>{
    expect(()=>approve(reviewed,new Date("2026-11-02T00:00:00Z")))
      .toThrow("AI_CREDIT_LIVE_RELEASE_EXPIRED");
    expect(()=>approve(reviewed,new Date("2026-10-23T00:00:00Z")))
      .toThrow("AI_CREDIT_LIVE_RELEASE_EXPIRED");
  });
  it("six distinct verifiable evidence references are mandatory",()=>{
    expect(()=>approve({...reviewed,evidenceRefs:{...evidenceRefs,merchantProcessingFees:""}}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_EVIDENCE_INCOMPLETE");
    expect(()=>approve({...reviewed,evidenceRefs:{...evidenceRefs,merchantProcessingFees:evidenceRefs.stripeLivePrice}}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_EVIDENCE_INCOMPLETE");
  });
  it("requires an accountable reviewer and valid model-independent live price",()=>{
    expect(()=>approve({...reviewed,reviewerId:""}))
      .toThrow("AI_CREDIT_LIVE_RELEASE_REVIEWER_INVALID");
    expect(()=>assertZoeBuildLivePackReleased({pack:{...pack,priceId:"fake"},
      reviews:[reviewed],occurredAt:time})).toThrow("AI_CREDIT_LIVE_PRICE_ID_INVALID");
  });
});
