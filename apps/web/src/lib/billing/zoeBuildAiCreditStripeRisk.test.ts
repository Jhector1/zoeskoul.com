import {describe, expect, it, vi} from "vitest";
import type Stripe from "stripe";
import {reconcileZoeBuildStripeRiskEvent, isZoeBuildStripeRiskEvent,
  type ZoeBuildStripeRiskDeps} from "./zoeBuildAiCreditStripeRisk";

const refund = {id:"re_test",chargeId:"ch_test",status:"succeeded",amount:600};
const dispute = {id:"dp_test",livemode:false,chargeId:"ch_test",status:"under_review",amount:1200};
const charge = {id:"ch_test",livemode:false,paymentIntentId:"pi_test",paid:true,
  captured:true,currency:"usd",amount:1200,amountRefunded:600,disputed:false};
function scenario(opts:{type?:string;ref?:Record<string,unknown>;disp?:Record<string,unknown>;
  charge?:Record<string,unknown>; funded?:boolean; live?:boolean}={}) {
  const type=opts.type??"refund.updated";
  const id=type.startsWith("refund.")?"re_test":type.startsWith("charge.dispute.")?"dp_test":"ch_test";
  const event={id:"evt_test",type,livemode:opts.live??false,
    data:{object:{id}}} as unknown as Stripe.Event;
  const freezeRisk=vi.fn(async()=>({kind:"frozen" as const,created:true}));
  const deps={retrieveRefund:vi.fn(async()=>({...refund,...opts.ref})),
    retrieveDispute:vi.fn(async()=>({...dispute,...opts.disp})),
    retrieveCharge:vi.fn(async()=>({...charge,...opts.charge})),
    findFundingLot:vi.fn(async()=>opts.funded===false?null:{userId:"server-owner"}),
    freezeRisk} as ZoeBuildStripeRiskDeps;
  return {event,deps,freezeRisk};
}
describe("E16C5B1 verified Stripe risk quarantine",()=>{
  it("retrieves a real refund and matching charge before freezing original funding lot",async()=>{
    const x=scenario();
    expect(isZoeBuildStripeRiskEvent(x.event)).toBe(true);
    expect(await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps}))
      .toEqual({kind:"frozen",created:true});
    expect(x.freezeRisk).toHaveBeenCalledWith({sourceKey:"stripe:zoebuild:pi:pi_test",
      stripeEventId:"evt_test",kind:"refund",providerObjectId:"re_test",
      paymentIntentId:"pi_test",chargeId:"ch_test",refundedAmountUsdMinor:600,chargedAmountUsdMinor:1200});
  });
  it("handles disputes using independently retrieved dispute+charge, even after dispute closes",async()=>{
    const x=scenario({type:"charge.dispute.closed",disp:{status:"won"},charge:{disputed:false,amountRefunded:0}});
    expect(await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps}))
      .toEqual({kind:"frozen",created:true});
    expect(x.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({kind:"dispute",providerObjectId:"dp_test"}));
  });
  it("handles independently verified partial charge refunds",async()=>{
    const x=scenario({type:"charge.refunded",charge:{amountRefunded:100}});
    await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps});
    expect(x.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({refundedAmountUsdMinor:100,kind:"refund"}));
  });
  it("passes the authoritative Charge amount alongside cumulative refund for exact rounding",async()=>{
    const x=scenario({charge:{amount:2500,amountRefunded:700}});
    await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps});
    expect(x.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({
      chargedAmountUsdMinor:2500,refundedAmountUsdMinor:700,
    }));
  });
  it("ignores other products without touching credit ledger",async()=>{
    const x=scenario({funded:false});
    expect(await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps}))
      .toEqual({kind:"not_zoebuild"});
    expect(x.freezeRisk).not.toHaveBeenCalled();
  });
  it("does not freeze a failed refund if current charge has not been refunded",async()=>{
    const x=scenario({type:"refund.failed",ref:{status:"failed"},charge:{amountRefunded:0}});
    expect(await reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps}))
      .toEqual({kind:"no_current_risk"});
    expect(x.freezeRisk).not.toHaveBeenCalled();
  });
  it("refuses altered refund linkage instead of trusting the event snapshot",async()=>{
    for(const ref of [{id:"re_other"},{chargeId:"bad"},{amount:-1}]){
      const x=scenario({ref});
      await expect(reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps})).rejects.toThrow();
      expect(x.freezeRisk).not.toHaveBeenCalled();
    }
  });
  it("refuses charge mismatches and unverified amounts",async()=>{
    for(const patch of [{id:"ch_wrong"},{paymentIntentId:"bad"},{livemode:true},
      {paid:false},{captured:false},{currency:"eur"},{amountRefunded:2000}]){
      const x=scenario({charge:patch});
      await expect(reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps})).rejects.toThrow();
      expect(x.freezeRisk).not.toHaveBeenCalled();
    }
  });
  it("freezes a verified live refund with the same ledger contract as test mode",async()=>{
    const x=scenario({live:true,charge:{livemode:true}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:x.event,deps:x.deps}))
      .resolves.toEqual({kind:"frozen",created:true});
    expect(x.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey:"stripe:zoebuild:pi:pi_test",kind:"refund",
      providerObjectId:"re_test",refundedAmountUsdMinor:600,
      chargedAmountUsdMinor:1200,
    }));
  });
  it("reconciles verified live disputes and cumulative charge refunds",async()=>{
    const disputed=scenario({type:"charge.dispute.created",live:true,
      disp:{livemode:true},charge:{livemode:true}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:disputed.event,deps:disputed.deps}))
      .resolves.toEqual({kind:"frozen",created:true});
    expect(disputed.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({
      kind:"dispute",providerObjectId:"dp_test",chargeId:"ch_test",
    }));
    const refunded=scenario({type:"charge.refunded",live:true,
      charge:{livemode:true,amountRefunded:700}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:refunded.event,deps:refunded.deps}))
      .resolves.toEqual({kind:"frozen",created:true});
    expect(refunded.freezeRisk).toHaveBeenCalledWith(expect.objectContaining({
      kind:"refund",providerObjectId:"ch_test",refundedAmountUsdMinor:700,
    }));
  });
  it("rejects a live event with cross-mode charge or dispute evidence",async()=>{
    const foreignCharge=scenario({live:true});
    await expect(reconcileZoeBuildStripeRiskEvent({event:foreignCharge.event,
      deps:foreignCharge.deps})).rejects.toThrow("AI_CREDIT_CHARGE_LOOKUP_MISMATCH");
    expect(foreignCharge.freezeRisk).not.toHaveBeenCalled();
    const foreignDispute=scenario({type:"charge.dispute.created",live:true,
      charge:{livemode:true}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:foreignDispute.event,
      deps:foreignDispute.deps})).rejects.toThrow("AI_CREDIT_DISPUTE_LOOKUP_MISMATCH");
    expect(foreignDispute.freezeRisk).not.toHaveBeenCalled();
  });
  it("does not freeze an unrelated live refund or failed unfunded risk",async()=>{
    const other=scenario({live:true,funded:false,charge:{livemode:true}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:other.event,deps:other.deps}))
      .resolves.toEqual({kind:"not_zoebuild"});
    expect(other.freezeRisk).not.toHaveBeenCalled();
    const failed=scenario({live:true,type:"refund.failed",
      ref:{status:"failed"},charge:{livemode:true,amountRefunded:0}});
    await expect(reconcileZoeBuildStripeRiskEvent({event:failed.event,deps:failed.deps}))
      .resolves.toEqual({kind:"no_current_risk"});
    expect(failed.freezeRisk).not.toHaveBeenCalled();
  });
  it("does not quarantine on forged malformed event identity",async()=>{
    const x=scenario();
    const event={...x.event,id:"forged"} as Stripe.Event;
    await expect(reconcileZoeBuildStripeRiskEvent({event,deps:x.deps}))
      .rejects.toThrow("AI_CREDIT_RISK_EVENT_ID_INVALID");
    expect(x.deps.retrieveRefund).not.toHaveBeenCalled();
  });
});
