import {describe,it,expect,vi} from "vitest";
import type Stripe from "stripe";
import {createZoeBuildAiCustomCheckout, type ZoeBuildCustomCheckoutDeps} from "./zoeBuildAiCreditStripeCheckout";
import {reconcileZoeBuildAiCreditCheckout, type ZoeBuildAiCreditStripeDeps} from "./zoeBuildAiCreditStripeFunding";
import {ZOE_CUSTOM_TOPUP_MARKER,ZOE_TOP_UP_POLICY} from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";
const ATTEMPT="zb-ai-123e4567-e89b-42d3-a456-426614174000";
const OWNER="user-owner";
const CUSTOMER="cus_custom_123";
const SESSION="cs_test_custom123";
const PRICE="price_approved_test500";
const AMOUNT=1725;
const UNITS="1725000";
const pack={priceId:PRICE,amountUsdMinor:500,creditUnits:"500000"};
const meta={zoebuildAiCreditPurchase:"v2",checkoutAttemptId:ATTEMPT,
  purchaseKind:ZOE_CUSTOM_TOPUP_MARKER,amountUsdMinor:String(AMOUNT),
  creditUnits:UNITS,pricingVersion:ZOE_TOP_UP_POLICY.version};
function fixture() {
  let claim: null | {userId:string;customerId:string;amountUsdMinor:number;stripeSessionId:string|null}=null;
  let paid=true;
  let refunded=false;
  let disputed=false;
  let remoteCreated=false;
  let wrongOwner=false;
  let grants=0;
  const keys=new Set<string>();
  const stripeSession={id:SESSION,livemode:false,mode:"payment",status:"open",customer:CUSTOMER,
    metadata:meta,url:"https://checkout.stripe.com/c/pay/test"};
  const checkoutDeps={
    retrievePrice:vi.fn(async()=>({id:PRICE,livemode:false,active:true,type:"one_time",currency:"usd",
      unitAmount:500,billingScheme:"per_unit",recurring:false,customUnitAmount:false})),
    findCustomerForUser:vi.fn(async(u:string)=>u===OWNER?CUSTOMER:null),
    retrieveCustomer:vi.fn(async()=>({id:CUSTOMER,livemode:false,deleted:false})),
    claimCustomAttempt:vi.fn(async(input:{userId:string;customerId:string;amountUsdMinor:number})=>{
      if(claim) {
        if(claim.userId!==input.userId || claim.customerId!==input.customerId ||
          claim.amountUsdMinor!==input.amountUsdMinor)throw Error("IMMUTABLE_CLAIM_CONFLICT");
        return {claimed:false,stripeSessionId:claim.stripeSessionId};
      }
      claim={...input,stripeSessionId:null};return {claimed:true,stripeSessionId:null};
    }),
    recordCustomSession:vi.fn(async({stripeSessionId}:{stripeSessionId:string})=>{
      if(!claim)throw Error("NO_CLAIM");claim.stripeSessionId=stripeSessionId;
      return {recorded:true};
    }),
    retrieveSession:vi.fn(async()=>stripeSession),
    listSessions:vi.fn(async()=>({hasMore:false,data:remoteCreated?[stripeSession]:[]})),
    listLineItems:vi.fn(async()=>({hasMore:false,data:[{priceId:"price_inline_987",quantity:1,amountSubtotal:AMOUNT}]})),
    createCustomSession:vi.fn(async()=>{remoteCreated=true;return stripeSession;}),
    claimAttempt:vi.fn(),recordSession:vi.fn(),createSession:vi.fn(),
  } as unknown as ZoeBuildCustomCheckoutDeps;
  const fundingDeps={
    retrieveSession:vi.fn(async()=>({...stripeSession,status:"complete",payment_status:paid?"paid":"unpaid",
      payment_intent:"pi_custom123",currency:"usd",amount_total:AMOUNT,amount_subtotal:AMOUNT,
      total_details:{amount_discount:0,amount_tax:0}})),
    listLineItems:vi.fn(async()=>({has_more:false,data:[{priceId:"price_inline_987",quantity:1,
      amount_total:AMOUNT,amount_subtotal:AMOUNT}]})),
    retrievePaymentIntent:vi.fn(async()=>({id:"pi_custom123",livemode:false,status:"succeeded",
      currency:"usd",amount:AMOUNT,amount_received:AMOUNT,latestCharge:{paymentIntentId:"pi_custom123",
        paid:true,captured:true,refunded,disputed,amount:AMOUNT,
        amount_refunded:refunded?AMOUNT:0,currency:"usd"}})),
    findUserIdByCustomerId:vi.fn(async()=>wrongOwner?"other-user":OWNER),
    findCheckoutAttempt:vi.fn(async()=>claim?{
      attemptId:ATTEMPT,userId:claim.userId,customerId:claim.customerId,
      priceId:ZOE_CUSTOM_TOPUP_MARKER,stripeSessionId:claim.stripeSessionId,
      amountUsdMinor:claim.amountUsdMinor,creditUnits:BigInt(UNITS),
      pricingVersion:ZOE_TOP_UP_POLICY.version}:null),
    grantPurchasedCredits:vi.fn(async({sourceKey}:{sourceKey:string})=>{
      if(keys.has(sourceKey))return {created:false};
      keys.add(sourceKey);grants++;return {created:true};
    }),
  } as unknown as ZoeBuildAiCreditStripeDeps;
  const input={deps:checkoutDeps,userId:OWNER,checkoutAttemptId:ATTEMPT,
    amountUsdMinor:AMOUNT,appOrigin:"https://build.zoeskoul.com",mode:"sandbox-only" as const,
    approvedPacks:[pack]};
  const event={type:"checkout.session.completed",livemode:false,
    data:{object:{id:SESSION,livemode:false,mode:"payment",metadata:meta}}} as unknown as Stripe.Event;
  const reconcile=()=>reconcileZoeBuildAiCreditCheckout({event,deps:fundingDeps,
    mode:"sandbox-only",approvedPacks:[pack]});
  return {checkoutDeps,fundingDeps,input,reconcile,setPaid:(v:boolean)=>{paid=v;},
    setRefunded:(v:boolean)=>{refunded=v;},setDisputed:(v:boolean)=>{disputed=v;},
    setWrongOwner:(v:boolean)=>{wrongOwner=v;},getGrants:()=>grants};
}
describe("V12J.28C custom Checkout sandbox contract",()=>{
  it("persists exact custom quote before Stripe and creates one-time inline pricing",async()=>{
    const f=fixture();
    const result=await createZoeBuildAiCustomCheckout(f.input);
    expect(result).toEqual({sessionId:SESSION,url:"https://checkout.stripe.com/c/pay/test",status:"open",created:true});
    expect(f.checkoutDeps.claimCustomAttempt).toHaveBeenCalledWith({attemptId:ATTEMPT,userId:OWNER,
      customerId:CUSTOMER,amountUsdMinor:AMOUNT});
    expect(f.checkoutDeps.createCustomSession).toHaveBeenCalledWith(expect.objectContaining({
      mode:"payment",customer:CUSTOMER,amountUsdMinor:AMOUNT,metadata:meta,
    }),expect.stringMatching(/^zoebuild-ai-credit-custom-checkout-[a-f0-9]{64}$/));
    expect(vi.mocked(f.checkoutDeps.claimCustomAttempt).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.checkoutDeps.createCustomSession).mock.invocationCallOrder[0]!);
  });
  it("replays same session and never creates a second Stripe session",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    expect((await createZoeBuildAiCustomCheckout(f.input)).created).toBe(false);
    expect(f.checkoutDeps.createCustomSession).toHaveBeenCalledTimes(1);
  });
  it("refuses attempt reuse for a different price",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    await expect(createZoeBuildAiCustomCheckout({...f.input,amountUsdMinor:2500}))
      .rejects.toThrow("IMMUTABLE_CLAIM_CONFLICT");
    expect(f.checkoutDeps.createCustomSession).toHaveBeenCalledTimes(1);
  });
  it("refuses live, off, out-of-range amounts and absent approved test anchor",async()=>{
    for (const patch of [{mode:"live" as const},{mode:"off" as const},
      {amountUsdMinor:499},{amountUsdMinor:50001},{approvedPacks:[]}]) {
      const f=fixture();
      await expect(createZoeBuildAiCustomCheckout({...f.input,...patch})).rejects.toThrow();
      expect(f.checkoutDeps.createCustomSession).not.toHaveBeenCalled();
    }
  });
  it("grants exact ledger units once using the verified payment intent",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    expect(await f.reconcile()).toEqual({kind:"funded",created:true});
    expect(await f.reconcile()).toEqual({kind:"funded",created:false});
    expect(f.fundingDeps.grantPurchasedCredits).toHaveBeenCalledWith({userId:OWNER,
      sourceKey:"stripe:zoebuild:pi:pi_custom123",units:UNITS});
    expect(f.getGrants()).toBe(1);
  });
  it("does not grant while unpaid, disputed, or refunded",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    f.setPaid(false);expect(await f.reconcile()).toEqual({kind:"pending"});
    f.setPaid(true);f.setRefunded(true);
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
    f.setRefunded(false);f.setDisputed(true);
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_PAYMENT_NOT_CLEAR");
    expect(f.getGrants()).toBe(0);
  });
  it("blocks customer mismatch, changed paid amount and forged snapshot",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    f.setWrongOwner(true);
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    f.setWrongOwner(false);
    vi.mocked(f.fundingDeps.retrieveSession).mockImplementationOnce(async()=>({
      id:SESSION,livemode:false,mode:"payment",status:"complete",payment_status:"paid",
      customer:CUSTOMER,payment_intent:"pi_custom123",currency:"usd",
      amount_total:AMOUNT-1,amount_subtotal:AMOUNT-1,metadata:meta,
      total_details:{amount_discount:0,amount_tax:0},
    }));
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_PRICE_OR_AMOUNT_MISMATCH");
    vi.mocked(f.fundingDeps.findCheckoutAttempt).mockImplementationOnce(async()=>({
      attemptId:ATTEMPT,userId:OWNER,customerId:CUSTOMER,
      priceId:ZOE_CUSTOM_TOPUP_MARKER,stripeSessionId:SESSION,
      amountUsdMinor:AMOUNT,creditUnits:99n,pricingVersion:ZOE_TOP_UP_POLICY.version,
    }));
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    expect(f.getGrants()).toBe(0);
  });
  it("rejects forged session metadata and non-Stripe inline prices",async()=>{
    const f=fixture();await createZoeBuildAiCustomCheckout(f.input);
    vi.mocked(f.fundingDeps.retrieveSession).mockImplementationOnce(async()=>({
      id:SESSION,livemode:false,mode:"payment",status:"complete",payment_status:"paid",
      customer:CUSTOMER,payment_intent:"pi_custom123",currency:"usd",
      amount_total:AMOUNT,amount_subtotal:AMOUNT,
      metadata:{...meta,creditUnits:"9000000"},total_details:{amount_discount:0,amount_tax:0},
    }));
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_CHECKOUT_PROVENANCE_MISMATCH");
    vi.mocked(f.fundingDeps.listLineItems).mockResolvedValueOnce({has_more:false,data:[{
      priceId:"not_a_stripe_price",quantity:1,amount_total:AMOUNT,amount_subtotal:AMOUNT,
    }]});
    await expect(f.reconcile()).rejects.toThrow("AI_CREDIT_PRICE_OR_AMOUNT_MISMATCH");
  });
});
