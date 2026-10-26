import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),user:vi.fn(),subs:vi.fn(),grants:vi.fn(),event:vi.fn(),checkout:vi.fn(),live:vi.fn(),recover:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.access}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{
  user:{findUnique:m.user},subscription:{findMany:m.subs},featureGrant:{findMany:m.grants},stripeEvent:{findFirst:m.event},
}}));
vi.mock("@/lib/billing/platformStripeProvider",()=>({verifyBuilderPlatformCheckoutReturn:m.checkout,readBuilderStripeLifecycle:m.live,recoverVerifiedBuilderCheckoutForSubscription:m.recover}));
import {GET} from "./route";
const req=(session="")=>new Request("https://zoebuild.test/api/billing/verification"+(session?"?session_id="+session:""));
const sub=(customer="cus_owner")=>({stripeCustomerId:customer,stripeSubscriptionId:"sub_builder",
  priceId:"price_builder",billingProduct:"builder_ai",status:"active",currentPeriodEnd:new Date("2100-01-01"),
  trialEnd:null,cancelAtPeriodEnd:false});
const grant=(feature:string)=>({feature,startsAt:null,endsAt:new Date("2100-01-01")});
beforeEach(()=>{
  vi.clearAllMocks();process.env.LEARNOIR_STRIPE_SECRET_KEY="sk_test_fixture";
  process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS="price_builder";process.env.ZOEBUILD_AI_STRIPE_PRODUCT_IDS="prod_builder";
  m.access.mockResolvedValue({userId:"self",entitlements:["build_ai_generate","build_ai_edit"]});
  m.user.mockResolvedValue({stripeCustomerId:"cus_owner"});m.subs.mockResolvedValue([sub()]);
  m.grants.mockResolvedValue([grant("build_ai_generate"),grant("build_ai_edit")]);
  m.event.mockResolvedValue({processedAt:new Date("2026-10-21")});m.checkout.mockResolvedValue({state:"verified",subscriptionId:"sub_builder"});
  m.recover.mockResolvedValue(false);
  m.live.mockResolvedValue({subscriptionId:"sub_builder",status:"active",periodEnd:"2100-01-01T00:00:00Z",
    cancelAt:null,cancelAtPeriodEnd:false,nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null});
});
describe("authenticated Builder billing acceptance evidence",()=>{
  it("requires signed Builder identity",async()=>{
    m.access.mockResolvedValue({userId:null,entitlements:[]});
    expect((await GET(req())).status).toBe(401);
    expect(m.user).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();
  });
  it("does not claim payment verified merely because a subscription exists",async()=>{
    const body=await (await GET(req())).json();
    expect(body).toMatchObject({mode:"test",subscriptionActive:true,webhookProcessed:true,checkoutReturn:"not_checked"});
    expect(m.checkout).not.toHaveBeenCalled();expect(JSON.stringify(body)).not.toContain("cus_owner");
    expect(JSON.stringify(body)).not.toContain("price_builder");
  });
  it("automatically verifies an exact paid Checkout for the active Builder subscription without a return URL",async()=>{
    m.recover.mockResolvedValue(true);
    const body=await (await GET(req())).json();
    expect(body.checkoutReturn).toBe("verified");
    expect(body.subscriptionActive).toBe(true);
    expect(body.webhookProcessed).toBe(true);
    expect(m.recover).toHaveBeenCalledExactlyOnceWith({userId:"self",customerId:"cus_owner",
      subscriptionId:"sub_builder",subscriptionIds:["sub_builder"]});
    expect(m.checkout).not.toHaveBeenCalled();
  });
  it("does not recover Checkout when the live subscription is not owned or eligible",async()=>{
    m.live.mockResolvedValue(null);
    expect((await (await GET(req())).json()).checkoutReturn).toBe("not_checked");
    expect(m.recover).not.toHaveBeenCalled();
    m.live.mockResolvedValue({subscriptionId:"sub_different",status:"active",periodEnd:"2100-01-01T00:00:00Z"});
    expect((await (await GET(req())).json()).checkoutReturn).toBe("not_checked");
    expect(m.recover).not.toHaveBeenCalled();
  });
  it("fails closed when Stripe Checkout recovery is unavailable",async()=>{
    m.recover.mockRejectedValue(new Error("Stripe unavailable"));
    const body=await (await GET(req())).json();
    expect(body.checkoutReturn).toBe("unavailable");
    expect(body.subscriptionActive).toBe(true);
    expect(body.webhookProcessed).toBe(true);
  });
  it("never substitutes an auto-discovered Checkout for an explicitly invalid session",async()=>{
    m.recover.mockResolvedValue(true);
    m.checkout.mockResolvedValue({state:"invalid",subscriptionId:null});
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body.checkoutReturn).toBe("invalid");
    expect(m.recover).not.toHaveBeenCalled();
  });
  it("does not accept a missing-product DB record as a Checkout recovery source",async()=>{
    m.recover.mockResolvedValue(true);
    m.subs.mockResolvedValue([{...sub(),billingProduct:null}]);
    const body=await (await GET(req())).json();
    expect(body.checkoutReturn).toBe("not_checked");
    expect(m.recover).not.toHaveBeenCalled();
  });
  it("accepts payment verification only from Stripe's server-side checkout adapter",async()=>{
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body.checkoutReturn).toBe("verified");
    expect(m.checkout).toHaveBeenCalledWith({sessionId:"cs_test_123456",userId:"self",customerId:"cus_owner",subscriptionIds:["sub_builder"]});
    expect(m.event).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({subscriptionId:{in:["sub_builder"]}})}));
  });
  it("reports a Stripe-confirmed payment before its subscription row arrives",async()=>{
    m.subs.mockResolvedValue([]);
    m.grants.mockResolvedValue([]);
    m.event.mockResolvedValue(null);
    m.checkout.mockResolvedValue({state:"paid_unreconciled",subscriptionId:"sub_new"});
    m.live.mockResolvedValue({subscriptionId:"sub_new",status:"active",periodEnd:"2100-01-01T00:00:00Z",cancelAt:null,cancelAtPeriodEnd:false,nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null});
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body).toMatchObject({mode:"test",checkoutReturn:"paid_unreconciled",
      webhookProcessed:false,subscriptionRecorded:false,subscriptionActive:false,
      generateGrant:false,editGrant:false});
    expect(m.event).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
      subscriptionId:{in:["sub_new"]},status:"processed",livemode:false,
    })}));
    expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({subscriptionIds:[]}));
    expect(JSON.stringify(body)).not.toContain("sub_new");
  });
  it("distinguishes a processed webhook from missing DB subscription and access",async()=>{
    m.subs.mockResolvedValue([]);
    m.grants.mockResolvedValue([]);
    m.checkout.mockResolvedValue({state:"paid_unreconciled",subscriptionId:"sub_new"});
    m.live.mockResolvedValue({subscriptionId:"sub_new",status:"active",periodEnd:"2100-01-01T00:00:00Z",cancelAt:null,cancelAtPeriodEnd:false,nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null});
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body.checkoutReturn).toBe("paid_unreconciled");
    expect(body.webhookProcessed).toBe(true);
    expect(body.subscriptionActive).toBe(false);
    expect(body.generateGrant).toBe(false);
    expect(body.editGrant).toBe(false);
  });
  it("finds a processed webhook on any eligible customer-owned Builder subscription, not just the first",async()=>{
    m.subs.mockResolvedValue([sub(),{...sub(),stripeSubscriptionId:"sub_second",currentPeriodEnd:new Date("2099-01-01")}]);
    m.live.mockResolvedValue({subscriptionId:"sub_second",status:"active",periodEnd:"2099-01-01T00:00:00Z",
      cancelAt:null,cancelAtPeriodEnd:false,nextBillingDate:null,nextBillingAmountMinor:null,nextBillingCurrency:null});
    m.event.mockImplementation(async ({where}:{where:{subscriptionId:{in:string[]}}})=>
      where.subscriptionId.in.includes("sub_second") ? {processedAt:new Date("2026-10-21")} : null);
    const body=await (await GET(req())).json();
    expect(body.webhookProcessed).toBe(true);
    expect(m.event).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
      subscriptionId:{in:["sub_second"]},
      status:"processed",livemode:false,
    })}));
  });
  it("does not accept a processed webhook for a foreign, expired canceled or learning-only record",async()=>{
    m.subs.mockResolvedValue([
      {...sub("cus_foreign"),stripeSubscriptionId:"sub_foreign"},
      // Terminal Stripe cancellations, foreign customers and learning-only prices are ineligible.
      {...sub(),stripeSubscriptionId:"sub_canceled",status:"canceled",currentPeriodEnd:new Date("2020-01-01T00:00:00.000Z")},
      {...sub(),stripeSubscriptionId:"sub_learning",priceId:"price_learning"},
    ]);
    m.event.mockResolvedValue({processedAt:new Date("2026-10-21")});
    const body=await (await GET(req())).json();
    expect(body.webhookProcessed).toBe(false);
    expect(m.event).not.toHaveBeenCalled();
  });
  it("denies a canceled Builder subscription even with a future paid period",async()=>{
    m.subs.mockResolvedValue([{...sub(),stripeSubscriptionId:"sub_paid_through",status:"canceled"}]);
    m.live.mockResolvedValue(null);
    const body=await (await GET(req())).json();
    expect(body.subscriptionActive).toBe(false);
    expect(body.webhookProcessed).toBe(false);
    expect(m.event).not.toHaveBeenCalled();
  });
  it("does not mix a confirmed historical payment with a different active Builder subscription",async()=>{
    m.checkout.mockResolvedValue({state:"verified",subscriptionId:"sub_different"});
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body.checkoutReturn).toBe("invalid");
    expect(body.webhookProcessed).toBe(false);
  });
  it("refuses a Builder record with missing or learning billingProduct",async()=>{
    for(const billingProduct of [null,"learning"]){
      m.subs.mockResolvedValue([{...sub(),billingProduct}]);
      const body=await (await GET(req())).json();
      expect(body.subscriptionActive).toBe(false);
      expect(body.webhookProcessed).toBe(false);
    }
  });
  it("never borrows another subscription's webhook for an invalid Checkout session",async()=>{
    m.checkout.mockResolvedValue({state:"invalid",subscriptionId:null});
    const body=await (await GET(req("cs_test_123456"))).json();
    expect(body.webhookProcessed).toBe(false);
    expect(body.checkoutReturn).toBe("invalid");
    expect(m.event).not.toHaveBeenCalled();
  });
  it("never verifies a foreign subscription or its ledger evidence",async()=>{
    m.subs.mockResolvedValue([sub("cus_foreign")]);
    const body=await (await GET(req())).json();
    expect(body.subscriptionActive).toBe(false);expect(body.webhookProcessed).toBe(false);
    expect(m.event).not.toHaveBeenCalled();
  });
  it("requires subscription-sourced grants, not admin or other credits",async()=>{
    m.grants.mockResolvedValue([]);
    const body=await (await GET(req())).json();expect(body.generateGrant).toBe(false);
    expect(body.editGrant).toBe(false);
    expect(m.grants).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({type:"subscription",revokedAt:null})}));
  });
  it("reports subscription-sourced grants only while the exact Stripe subscription is verified",async()=>{
    const before=await (await GET(req())).json();
    expect(before).toMatchObject({subscriptionActive:true,generateGrant:true,editGrant:true});

    // The DB still has an unrevoked grant, but Stripe no longer has the plan.
    m.live.mockResolvedValue(null);
    const gone=await (await GET(req())).json();
    expect(gone).toMatchObject({subscriptionActive:false,generateGrant:false,editGrant:false});

    // A different current Stripe subscription cannot authorize this old grant.
    m.live.mockResolvedValue({subscriptionId:"sub_other",status:"active",periodEnd:"2100-01-01T00:00:00Z"});
    const other=await (await GET(req())).json();
    expect(other).toMatchObject({subscriptionActive:false,generateGrant:false,editGrant:false});
  });
  it("does not report grants for foreign or terminal subscription records",async()=>{
    m.subs.mockResolvedValue([sub("cus_foreign")]);
    const foreign=await (await GET(req())).json();
    expect(foreign).toMatchObject({subscriptionActive:false,generateGrant:false,editGrant:false});

    m.subs.mockResolvedValue([{...sub(),status:"canceled"}]);
    const ended=await (await GET(req())).json();
    expect(ended).toMatchObject({subscriptionActive:false,generateGrant:false,editGrant:false});
  });
  it("retains subscription grant diagnostics during a verified scheduled cancellation, not beyond it",async()=>{
    m.subs.mockResolvedValue([{...sub(),cancelAtPeriodEnd:true}]);
    m.live.mockResolvedValue({subscriptionId:"sub_builder",status:"active",periodEnd:"2100-01-01T00:00:00Z",
      cancelAt:"2100-01-01T00:00:00Z",cancelAtPeriodEnd:true,nextBillingDate:null,
      nextBillingAmountMinor:null,nextBillingCurrency:null});
    const scheduled=await (await GET(req())).json();
    expect(scheduled).toMatchObject({subscriptionActive:true,cancelAtPeriodEnd:true,generateGrant:true,editGrant:true});

    // The user must also have current access from the shared entitlement owner.
    m.access.mockResolvedValue({userId:"self",entitlements:[]});
    const revoked=await (await GET(req())).json();
    expect(revoked).toMatchObject({subscriptionActive:true,generateGrant:false,editGrant:false});
  });
  it("fails closed when Stripe or the ledger is unavailable",async()=>{
    m.checkout.mockRejectedValue(new Error("offline"));
    expect((await (await GET(req("cs_test_123456"))).json()).checkoutReturn).toBe("unavailable");
    m.event.mockRejectedValue(new Error("db offline"));
    expect((await GET(req())).status).toBe(503);
  });
});
