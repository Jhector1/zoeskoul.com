import {describe,it,expect,vi} from "vitest";
import type Stripe from "stripe";
import {createZoeBuildAiCreditTestCheckout} from "./zoeBuildAiCreditStripeCheckout";
import {creditFundingIsLive,reconcileZoeBuildAiCreditCheckout,APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS} from "./zoeBuildAiCreditStripeFunding";
import type {ZoeBuildCreditCheckoutDeps} from "./zoeBuildAiCreditStripeCheckout";
import type {ZoeBuildAiCreditStripeDeps} from "./zoeBuildAiCreditStripeFunding";
const attempt="zb-ai-123e4567-e89b-12d3-a456-426614174000";
const pack={priceId:"price_reviewed_live",amountUsdMinor:500,creditUnits:"500000"};
const metadata={zoebuildAiCreditPurchase:"v1",checkoutAttemptId:attempt,creditPackPriceId:pack.priceId};
function checkout(live:boolean){
  const session={id:live?"cs_live_reviewed":"cs_test_reviewed",livemode:live,mode:"payment",status:"open",customer:"cus_reviewed",url:"https://checkout.stripe.com/session",metadata};
  const deps={retrievePrice:vi.fn(async()=>({id:pack.priceId,livemode:live,active:true,type:"one_time",currency:"usd",unitAmount:500,billingScheme:"per_unit",recurring:false,customUnitAmount:false})),
    findCustomerForUser:vi.fn(async()=>"cus_reviewed"),retrieveCustomer:vi.fn(async()=>({id:"cus_reviewed",livemode:live,deleted:false})),
    claimAttempt:vi.fn(async()=>({claimed:true,stripeSessionId:null})),recordSession:vi.fn(async()=>({recorded:true})),
    retrieveSession:vi.fn(async()=>session),listSessions:vi.fn(async()=>({hasMore:false,data:[]})),
    listLineItems:vi.fn(async()=>({hasMore:false,data:[{quantity:1,priceId:pack.priceId,amountSubtotal:500}]})),
    createSession:vi.fn(async()=>session)} as unknown as ZoeBuildCreditCheckoutDeps;
  return {deps,input:{deps,userId:"owner-123",priceId:pack.priceId,checkoutAttemptId:attempt,appOrigin:"https://build.zoeskoul.com",mode:live?"live" as const:"sandbox-only" as const,approvedPacks:[pack]}};
}
describe("V12J.18 Stripe test/live parity",()=>{
  it("does not activate an unreviewed live catalog",()=>{
    expect(APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS).toHaveLength(0);
    expect(creditFundingIsLive("sandbox-only")).toBe(false);
    expect(creditFundingIsLive("live")).toBe(true);
    expect(creditFundingIsLive("off")).toBeNull();
  });
  it.each([false,true])("mode %s creates a bound checkout with immutable claim",async live=>{
    const {deps,input}=checkout(live);
    const value=await createZoeBuildAiCreditTestCheckout(input);
    expect(value).toMatchObject({created:true,status:"open"});
    expect(deps.recordSession).toHaveBeenCalledTimes(1);
  });
  it("never creates a live checkout against a test price or test customer",async()=>{
    const a=checkout(true);
    Object.defineProperty(a.deps,"retrievePrice",{value:vi.fn(async()=>({id:pack.priceId,livemode:false,active:true,type:"one_time",currency:"usd",unitAmount:500,billingScheme:"per_unit",recurring:false,customUnitAmount:false}))});
    await expect(createZoeBuildAiCreditTestCheckout(a.input)).rejects.toThrow("AI_CREDIT_CHECKOUT_PRICE_MISMATCH");
    expect(a.deps.createSession).not.toHaveBeenCalled();
    const b=checkout(true);
    Object.defineProperty(b.deps,"retrieveCustomer",{value:vi.fn(async()=>({id:"cus_reviewed",livemode:false,deleted:false}))});
    await expect(createZoeBuildAiCreditTestCheckout(b.input)).rejects.toThrow("AI_CREDIT_CHECKOUT_CUSTOMER_MISMATCH");
  });
  it("rejects cross-environment signed event before payment lookups",async()=>{
    const event={id:"evt_live",type:"checkout.session.completed",livemode:true,data:{object:{id:"cs_live_reviewed",livemode:true,mode:"payment",metadata}}} as unknown as Stripe.Event;
    const deps={retrieveSession:vi.fn()} as unknown as ZoeBuildAiCreditStripeDeps;
    await expect(reconcileZoeBuildAiCreditCheckout({event,deps,mode:"sandbox-only",approvedPacks:[pack]})).rejects.toThrow("AI_CREDIT_STRIPE_MODE_MISMATCH");
    expect(deps.retrieveSession).not.toHaveBeenCalled();
  });
  it("verifies a paid live checkout against current payment, ownership and immutable attempt",async()=>{
    const session={id:"cs_live_reviewed",livemode:true,status:"complete",mode:"payment",payment_status:"paid",customer:"cus_reviewed",payment_intent:"pi_reviewed",currency:"usd",amount_total:500,amount_subtotal:500,total_details:{amount_discount:0,amount_tax:0},metadata};
    const payment={id:"pi_reviewed",livemode:true,status:"succeeded",currency:"usd",amount:500,amount_received:500,latestCharge:{paymentIntentId:"pi_reviewed",paid:true,captured:true,refunded:false,disputed:false,amount:500,amount_refunded:0,currency:"usd"}};
    const grant=vi.fn(async()=>({created:true}));
    const deps={retrieveSession:vi.fn(async()=>session),listLineItems:vi.fn(async()=>({has_more:false,data:[{quantity:1,priceId:pack.priceId,amount_subtotal:500,amount_total:500}]})),retrievePaymentIntent:vi.fn(async()=>payment),findUserIdByCustomerId:vi.fn(async()=>"owner-123"),findCheckoutAttempt:vi.fn(async()=>({attemptId:attempt,userId:"owner-123",priceId:pack.priceId,customerId:"cus_reviewed",stripeSessionId:session.id})),grantPurchasedCredits:grant};
    const event={id:"evt_live",type:"checkout.session.completed",livemode:true,data:{object:session}} as unknown as Stripe.Event;
    expect(await reconcileZoeBuildAiCreditCheckout({event,deps,mode:"live",approvedPacks:[pack]})).toEqual({kind:"funded",created:true});
    expect(grant).toHaveBeenCalledWith({userId:"owner-123",sourceKey:"stripe:zoebuild:pi:pi_reviewed",units:"500000"});
  });
});
