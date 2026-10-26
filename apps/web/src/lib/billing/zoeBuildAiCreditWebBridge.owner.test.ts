import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const file=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
describe("V12J.20 canonical payment ownership",()=>{
  it("keeps signed webhook verification, environment guard and durable event ledger in Web",()=>{
    const webhook=file("../../app/api/stripe/webhook/route.ts");
    for(const key of ["getStripe().webhooks.constructEvent", "checkPlatformStripeEventEnvironment", "processPlatformBillingWebhook", "claimStripeEvent"])
      expect(webhook).toContain(key);
    const handler=file("./stripeWebhookReconciliation.ts");
    expect(handler).toContain("reconcileZoeBuildAiCreditCheckoutEvent(event)");
    expect(handler).toContain("reconcileZoeBuildStripeRiskWebhook(event)");
  });
  it("never exposes a live catalog without verified Stripe price and reviewed live pack",()=>{
    const handler=file("./zoeBuildAiCreditStripeCheckout.server.ts");
    const funding=file("./zoeBuildAiCreditStripeFunding.ts");
    expect(handler).toContain("verifiedZoeBuildAiCreditCatalog");
    expect(handler).toContain("actual.livemode !== expectedLive");
    expect(funding).toContain("APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS: readonly ApprovedZoeBuildCreditPack[] = Object.freeze([])");
  });
  it("does not invent a credit-grant path in ZoeBuild",()=>{
    const proxy=file("../../../../zoebuild/src/app/api/billing/credit-packs/checkout/route.ts");
    expect(proxy).toContain("requestBuilderAiCreditService(token");
    expect(proxy).toContain("isTrustedBillingMutation");
    expect(proxy).not.toContain("grantAiCreditLot");
  });
});
