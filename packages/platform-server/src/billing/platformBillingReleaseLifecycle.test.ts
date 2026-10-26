import {describe,expect,it} from "vitest";
import {resolvePlatformBillingCatalog,requirePlatformPriceForProduct} from "./productCatalog";
import {hasCurrentSubscriptionAccess} from "./subscriptionEligibility";
import {activePlatformProductSubscription} from "./subscriptionProjection";

const now=new Date("2026-10-21T00:00:00.000Z");
const future=new Date("2026-11-21T00:00:00.000Z");
const past=new Date("2026-10-20T00:00:00.000Z");
const catalog=resolvePlatformBillingCatalog({
  STRIPE_PRICE_MONTHLY_ID:"price_learningMonthly",
  STRIPE_PRICE_YEARLY_ID:"price_learningYearly",
  ZOEBUILD_AI_STRIPE_PRICE_IDS:"price_builderMonthly,price_builderYearly",
});
const subscription=(priceId:string,status:string,period:Date|null=future,trial:Date|null=null)=>
  ({priceId,status,currentPeriodEnd:period,trialEnd:trial,cancelAtPeriodEnd:false});
const current=(rows:ReturnType<typeof subscription>[])=>
  activePlatformProductSubscription({product:"builder_ai",catalog,subscriptions:rows,now});

describe("release: platform billing product and lifecycle boundaries",()=>{
  it("never maps ZoeBuild AI prices into learning Checkout and vice versa",()=>{
    expect(()=>requirePlatformPriceForProduct({catalog,product:"learning",priceId:"price_builderMonthly"})).toThrow();
    expect(()=>requirePlatformPriceForProduct({catalog,product:"builder_ai",priceId:"price_learningMonthly"})).toThrow();
    expect(requirePlatformPriceForProduct({catalog,product:"builder_ai",priceId:"price_builderMonthly"}).product).toBe("builder_ai");
  });
  it("fails closed on a shared Builder/Learning Stripe price even during testing",()=>{
    expect(()=>resolvePlatformBillingCatalog({STRIPE_PRICE_MONTHLY_ID:"price_shared",ZOEBUILD_AI_STRIPE_PRICE_IDS:"price_shared"})).toThrow();
  });
  it("recognizes active renewals only while the Stripe-paid period is in the future",()=>{
    expect(current([subscription("price_builderMonthly","active",future)])).not.toBeNull();
    expect(current([subscription("price_builderMonthly","active",past)])).toBeNull();
  });
  it("does not activate Builder AI from an active learning-only subscription",()=>{
    expect(current([subscription("price_learningMonthly","active",future)])).toBeNull();
  });
  it("revokes unpaid, incomplete, paused, and expired trial subscriptions",()=>{
    for(const status of ["unpaid","incomplete","incomplete_expired","paused"]){
      expect(current([subscription("price_builderMonthly",status,future)])).toBeNull();
    }
    expect(current([subscription("price_builderMonthly","trialing",future,past)])).toBeNull();
  });
  it("preserves valid trials but never extends them using an unrelated billing period",()=>{
    expect(current([subscription("price_builderMonthly","trialing",past,future)])).not.toBeNull();
    expect(hasCurrentSubscriptionAccess({status:"trialing",trialEnd:past,currentPeriodEnd:future,nowMs:now.getTime()})).toBe(false);
  });
  it("revokes a terminal cancellation immediately even with a future stored period",()=>{
    expect(current([subscription("price_builderMonthly","canceled",future)])).toBeNull();
    expect(current([subscription("price_builderMonthly","canceled",past)])).toBeNull();
  });
  it("honors past-due subscriptions only within their remaining period",()=>{
    expect(current([subscription("price_builderMonthly","past_due",future)])).not.toBeNull();
    expect(current([subscription("price_builderMonthly","past_due",past)])).toBeNull();
  });
  it("does not use unrelated periods to reactivate a canceled Builder subscription",()=>{
    expect(current([subscription("price_builderMonthly","canceled",past),subscription("price_learningMonthly","active",future)])).toBeNull();
  });
});
