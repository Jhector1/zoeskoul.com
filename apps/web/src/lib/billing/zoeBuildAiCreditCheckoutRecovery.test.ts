import {describe,it,expect,vi} from "vitest";
import {ZOE_CUSTOM_TOPUP_MARKER,ZOE_TOP_UP_POLICY}
  from "@zoeskoul/platform-server/ai-credits/customCreditTopUp";
import {verifyCustomCreditCheckout,verifyFixedCreditCheckout,type RecoveryDeps,type RecoveryAttempt,type RecoverySession}
  from "./zoeBuildAiCreditCheckoutRecovery";
const id="zb-ai-123e4567-e89b-42d3-a456-426614174000";
const sessionId="cs_test_recovery123";
const url="https://checkout.stripe.com/c/pay/cs_test_recovery123";
function setup(){
  const saved:RecoveryAttempt={userId:"user1",priceId:ZOE_CUSTOM_TOPUP_MARKER,customerId:"cus_test123",
    amountUsdMinor:725,creditUnits:725000n,pricingVersion:ZOE_TOP_UP_POLICY.version,
    stripeSessionId:sessionId};
  const session:RecoverySession={id:sessionId,livemode:false,mode:"payment",status:"open",paymentStatus:"unpaid",
    customer:saved.customerId,url,amountTotal:725,currency:"usd",paymentIntent:"pi_testfunded123",
    metadata:{zoebuildAiCreditPurchase:"v2",purchaseKind:ZOE_CUSTOM_TOPUP_MARKER,
      checkoutAttemptId:id,amountUsdMinor:"725",creditUnits:"725000",pricingVersion:ZOE_TOP_UP_POLICY.version}};
  const deps={findAttempt:vi.fn(async():Promise<RecoveryAttempt|null>=>saved),findUserCustomer:vi.fn(async()=>saved.customerId),
    retrieveSession:vi.fn(async():Promise<RecoverySession>=>session),listSessions:vi.fn(async():Promise<{data:readonly RecoverySession[];hasMore:boolean}>=>({data:[session],hasMore:false})),
    listLineItems:vi.fn(async()=>({data:[{quantity:1,priceId:"price_testrecovery",amountSubtotal:725}],hasMore:false})),
    expireSession:vi.fn(async()=>{}),
    findFundedPurchase:vi.fn(async()=>null as null|{userId:string;kind:string;grantedUnits:bigint;
      grantDelta:bigint;reversedUnits:bigint;reversalTargetUnits:bigint;
      reversalShortfallUnits:bigint;riskFrozen:boolean})};
  return {deps,saved,session,input:{deps:deps as RecoveryDeps,authenticatedUserId:"user1",checkoutAttemptId:id,amountUsdMinor:725}};
}
describe("V12J29B Stripe TEST custom checkout read-only recovery",()=>{
  it("resumes only the exact open unpaid session",async()=>{
    const {input,deps}=setup();expect(await verifyCustomCreditCheckout(input)).toEqual({state:"open",url});
    expect(deps.listSessions).not.toHaveBeenCalled();
  });
  it("accepts a Stripe-hosted checkout URL with its legitimate fragment",async()=>{
    const {input,deps,session}=setup();
    const checkoutUrl="https://checkout.stripe.com/c/pay/cs_test_recovery123#fidkdWx-test-token";
    deps.retrieveSession.mockResolvedValue({...session,url:checkoutUrl});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"open",url:checkoutUrl});
    expect(deps.findFundedPurchase).not.toHaveBeenCalled();
  });
  it("never accepts an attacker hostname even with a checkout-shaped fragment",async()=>{
    const {input,deps,session}=setup();
    deps.retrieveSession.mockResolvedValue({...session,
      url:"https://checkout.stripe.com.attacker.example/c/pay/cs_test_recovery123#fidkdWx"});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"unresolved"});
  });
  it("explicit cancellation expires only the verified owner-bound unpaid TEST session",async()=>{
    const {input,deps,session}=setup();
    deps.retrieveSession.mockResolvedValueOnce(session).mockResolvedValueOnce({...session,status:"expired",paymentStatus:"unpaid"});
    expect(await verifyCustomCreditCheckout({...input,cancel:true})).toEqual({state:"expired_unpaid"});
    expect(deps.expireSession).toHaveBeenCalledTimes(1);
    expect(deps.expireSession).toHaveBeenCalledWith(sessionId);
  });
  it("never expires someone else's checkout or an already-paid session",async()=>{
    const a=setup();
    expect((await verifyCustomCreditCheckout({...a.input,authenticatedUserId:"attacker",cancel:true})).state).toBe("unresolved");
    expect(a.deps.expireSession).not.toHaveBeenCalled();
    const b=setup();b.deps.retrieveSession.mockResolvedValue({...b.session,status:"complete",paymentStatus:"paid"});
    expect((await verifyCustomCreditCheckout({...b.input,cancel:true})).state).toBe("completed");
    expect(b.deps.expireSession).not.toHaveBeenCalled();
  });
  it("fails closed if Stripe expiration races with payment completion or throws",async()=>{
    const a=setup();a.deps.expireSession.mockRejectedValue(new Error("Stripe no longer open"));
    expect(await verifyCustomCreditCheckout({...a.input,cancel:true})).toEqual({state:"unresolved"});
    const b=setup();b.deps.retrieveSession.mockResolvedValueOnce(b.session)
      .mockResolvedValueOnce({...b.session,status:"complete",paymentStatus:"paid"});
    expect(await verifyCustomCreditCheckout({...b.input,cancel:true})).toEqual({state:"unresolved"});
  });
  it("releases only expired and unpaid, without performing writes",async()=>{
    const {input,deps,session}=setup();deps.retrieveSession.mockResolvedValue({...session,status:"expired",paymentStatus:"unpaid"});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"expired_unpaid"});
    expect(Object.keys(deps)).not.toContain("updateAttempt");
  });
  it("does not release paid, processing, unknown, or completed payments",async()=>{
    for(const status of ["expired","open","complete","unknown"]){
      const {input,deps,session}=setup();
      deps.retrieveSession.mockResolvedValue({...session,status,paymentStatus:"paid"});
      const result=await verifyCustomCreditCheckout(input);
      expect(result.state).not.toBe("expired_unpaid");
    }
    const {input,deps,session}=setup();deps.retrieveSession.mockResolvedValue({...session,status:"expired",paymentStatus:"unpaid_pending"});
    expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
  });
  it("rejects forged user, wrong amount and detached customer before Stripe",async()=>{
    for(const mutation of [{authenticatedUserId:"attacker"},{amountUsdMinor:726}]){
      const {input,deps}=setup();expect((await verifyCustomCreditCheckout({...input,...mutation})).state).toBe("unresolved");
      expect(deps.retrieveSession).not.toHaveBeenCalled();
    }
    const {input,deps}=setup();deps.findUserCustomer.mockResolvedValue("cus_other");
    expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
  });
  it("blocks price, pricing version, ledger amount, and purchase-kind mismatch",async()=>{
    for(const field of [{priceId:"price_someother"},{pricingVersion:"another-version"},{creditUnits:725001n}]){
      const {input,deps,saved}=setup();deps.findAttempt.mockResolvedValue({...saved,...field});
      expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
      expect(deps.retrieveSession).not.toHaveBeenCalled();
    }
  });
  it("blocks wrong mode, customer, metadata, total, and malicious resume host",async()=>{
    for(const field of [{livemode:true},{customer:"cus_intruder"},{amountTotal:700},
      {currency:"eur"},{url:"https://stripe.example/c/pay/evil"},
      {metadata:{checkoutAttemptId:id}}]){
      const {input,deps,session}=setup();deps.retrieveSession.mockResolvedValue({...session,...field});
      expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
    }
  });
  it("blocks duplicated, wrong amount and truncated line items",async()=>{
    const {input,deps}=setup();deps.listLineItems.mockResolvedValue({
      data:[{quantity:1,priceId:"price_testrecovery",amountSubtotal:725}],hasMore:true});
    expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
  });
  it("recovers session from complete non-truncated history when DB recording failed",async()=>{
    const {input,deps,saved}=setup();deps.findAttempt.mockResolvedValue({...saved,stripeSessionId:null});
    expect((await verifyCustomCreditCheckout(input)).state).toBe("open");
    expect(deps.listSessions).toHaveBeenCalledTimes(1);
  });
  it("never treats missing or truncated Stripe history as proof of nonpayment",async()=>{
    for(const status of [{data:[],hasMore:false},{data:[],hasMore:true}]){
      const {input,deps,saved}=setup();deps.findAttempt.mockResolvedValue({...saved,stripeSessionId:null});
      deps.listSessions.mockResolvedValue(status as never);
      expect((await verifyCustomCreditCheckout(input)).state).toBe("unresolved");
    }
  });
  it("does not release a paid session while the signed webhook is pending",async()=>{
    const {input,deps,session}=setup();
    deps.retrieveSession.mockResolvedValue({...session,status:"complete",paymentStatus:"paid"});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"completed"});
    expect(deps.findFundedPurchase).toHaveBeenCalledWith({userId:"user1",paymentIntentId:"pi_testfunded123"});
  });
  it("releases a paid session only after a matching purchased lot and grant ledger entry",async()=>{
    const {input,deps,session}=setup();
    deps.retrieveSession.mockResolvedValue({...session,status:"complete",paymentStatus:"paid"});
    deps.findFundedPurchase.mockResolvedValue({userId:"user1",kind:"purchased",grantedUnits:725000n,
      grantDelta:725000n,reversedUnits:0n,reversalTargetUnits:0n,
      reversalShortfallUnits:0n,riskFrozen:false});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"funded"});
  });
  it("refuses mismatched, reversed, and risk-frozen funding receipts",async()=>{
    const good={userId:"user1",kind:"purchased",grantedUnits:725000n,
      grantDelta:725000n,reversedUnits:0n,reversalTargetUnits:0n,
      reversalShortfallUnits:0n,riskFrozen:false};
    for(const bad of [{userId:"attacker"},{kind:"subscription"},{grantedUnits:724000n},
      {grantDelta:724000n},{reversedUnits:1n},{reversalTargetUnits:1n},
      {reversalShortfallUnits:1n},{riskFrozen:true}]){
      const {input,deps,session}=setup();
      deps.retrieveSession.mockResolvedValue({...session,status:"complete",paymentStatus:"paid"});
      deps.findFundedPurchase.mockResolvedValue({...good,...bad});
      expect(await verifyCustomCreditCheckout(input)).toEqual({state:"completed"});
    }
  });
  it("does not trust checkout success without a bound persisted payment intent",async()=>{
    for(const mutation of [{paymentStatus:"unpaid"},{paymentIntent:"pi_notfunded"},
      {paymentIntent:null}]){
      const {input,deps,session}=setup();
      deps.retrieveSession.mockResolvedValue({...session,status:"complete",paymentStatus:"paid",...mutation});
      expect(await verifyCustomCreditCheckout(input)).toEqual({state:"completed"});
    }
    const {input,deps,saved,session}=setup();
    deps.findAttempt.mockResolvedValue({...saved,stripeSessionId:null});
    deps.listSessions.mockResolvedValue({data:[{...session,status:"complete",paymentStatus:"paid"}],hasMore:false});
    expect(await verifyCustomCreditCheckout(input)).toEqual({state:"completed"});
    expect(deps.findFundedPurchase).not.toHaveBeenCalled();
  });
});


describe("V12J29D historical fixed-pack test checkout recovery",()=>{
 const fixed=()=>{
   const x=setup();
   x.deps.findAttempt.mockResolvedValue({userId:"user1",priceId:"price_old123",customerId:"cus_test123",
     amountUsdMinor:null,creditUnits:null,pricingVersion:null,stripeSessionId:sessionId});
   x.deps.retrieveSession.mockResolvedValue({...x.session,metadata:{zoebuildAiCreditPurchase:"v1",
     checkoutAttemptId:id,creditPackPriceId:"price_old123"}});
   x.deps.listLineItems.mockResolvedValue({data:[{quantity:1,priceId:"price_old123",amountSubtotal:725}],hasMore:false});
   return {...x,input:{deps:x.deps as RecoveryDeps,authenticatedUserId:"user1",checkoutAttemptId:id,priceId:"price_old123"}};
 };
 it("resumes exact historical open unpaid session without creating a payment",async()=>{
   const x=fixed();expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"open",url});
 });
 it("can cancel a historical fixed session only after verified owner, price, and Stripe state",async()=>{
   const x=fixed();
   x.deps.retrieveSession.mockResolvedValueOnce({...x.session,metadata:{zoebuildAiCreditPurchase:"v1",
     checkoutAttemptId:id,creditPackPriceId:"price_old123"}})
     .mockResolvedValueOnce({...x.session,status:"expired",paymentStatus:"unpaid"});
   expect(await verifyFixedCreditCheckout({...x.input,cancel:true})).toEqual({state:"expired_unpaid"});
   expect(x.deps.expireSession).toHaveBeenCalledWith(sessionId);
   const y=fixed();
   expect((await verifyFixedCreditCheckout({...y.input,priceId:"price_wrong",cancel:true})).state).toBe("unresolved");
   expect(y.deps.expireSession).not.toHaveBeenCalled();
 });
 it("only releases a Stripe expired and unpaid historical attempt",async()=>{
   const x=fixed();x.deps.retrieveSession.mockResolvedValue({...x.session,status:"expired",paymentStatus:"unpaid",metadata:{zoebuildAiCreditPurchase:"v1",checkoutAttemptId:id,creditPackPriceId:"price_old123"}});
   expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"expired_unpaid"});
 });
 it("fails closed on foreign owner, wrong price, duplicate lines, and missing DB attempt",async()=>{
   const x=fixed();expect((await verifyFixedCreditCheckout({...x.input,authenticatedUserId:"wrong"})).state).toBe("unresolved");
   expect((await verifyFixedCreditCheckout({...x.input,priceId:"price_other"})).state).toBe("unresolved");
   x.deps.findAttempt.mockResolvedValue(null);
   expect((await verifyFixedCreditCheckout(x.input)).state).toBe("unresolved");
   const y=fixed();y.deps.listLineItems.mockResolvedValue({data:[{quantity:1,priceId:"price_other",amountSubtotal:725}],hasMore:false});
   expect((await verifyFixedCreditCheckout(y.input)).state).toBe("unresolved");
 });
 it("completed historical Stripe session requires persisted, unreversed grant",async()=>{
   const x=fixed();const completed={...x.session,status:"complete",paymentStatus:"paid",metadata:{zoebuildAiCreditPurchase:"v1",checkoutAttemptId:id,creditPackPriceId:"price_old123"}};
   x.deps.retrieveSession.mockResolvedValue(completed);
   expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"completed"});
   x.deps.findFundedPurchase.mockResolvedValue({userId:"user1",kind:"purchased",grantedUnits:500000n,
     grantDelta:500000n,reversedUnits:0n,reversalTargetUnits:0n,reversalShortfallUnits:0n,riskFrozen:false});
   expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"funded"});
   x.deps.findFundedPurchase.mockResolvedValue({userId:"user1",kind:"purchased",grantedUnits:500000n,
     grantDelta:500000n,reversedUnits:1n,reversalTargetUnits:0n,reversalShortfallUnits:0n,riskFrozen:false});
   expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"completed"});
 });
 it("rejects missing or incomplete Stripe history when session was not recorded",async()=>{
   const x=fixed();x.deps.findAttempt.mockResolvedValue({userId:"user1",priceId:"price_old123",customerId:"cus_test123",
     amountUsdMinor:null,creditUnits:null,pricingVersion:null,stripeSessionId:null});
   x.deps.listSessions.mockResolvedValue({data:[],hasMore:true});
   expect(await verifyFixedCreditCheckout(x.input)).toEqual({state:"unresolved"});
 });
});
