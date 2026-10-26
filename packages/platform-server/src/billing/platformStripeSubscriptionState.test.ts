import {describe,it,expect} from "vitest";
import {blocksNewPlatformCheckout,isStripeSubscriptionLive} from "./platformStripeSubscriptionState";
describe("Stripe-authoritative checkout and access states",()=>{
  it("does not block fresh Checkout after terminal cancellation",()=>{
    for(const s of ["canceled","incomplete_expired"])expect(blocksNewPlatformCheckout(s)).toBe(false);
  });
  it("prevents duplicate subscriptions while Stripe lifecycle is unresolved",()=>{
    for(const s of ["active","trialing","past_due","unpaid","incomplete","paused"])
      expect(blocksNewPlatformCheckout(s)).toBe(true);
  });
  it("does not treat canceled as active for entitlement or renewal display",()=>{
    expect(isStripeSubscriptionLive("canceled")).toBe(false);
    expect(isStripeSubscriptionLive("active")).toBe(true);
  });
});
