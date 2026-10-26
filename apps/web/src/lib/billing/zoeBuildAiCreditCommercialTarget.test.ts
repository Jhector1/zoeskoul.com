import {describe,it,expect} from "vitest";
import {approvedZoeBuildCreditPacks,approvedZoeBuildSandboxCreditPacks,
  APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS} from "./zoeBuildAiCreditStripeFunding";
import {ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET as target} from "@zoeskoul/platform-server/ai-credits/math";

describe("V12J.25 commercial target does not silently activate live Stripe",()=>{
  it("keeps the live pack registry empty",()=>{
    expect(APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS).toHaveLength(0);
    expect(target.liveStripePriceApproved).toBe(false);
  });
  it("preserves existing approved test-only package and exact credit units",()=>{
    const packs=approvedZoeBuildSandboxCreditPacks({mode:"sandbox-only",
      stripeKey:"sk_test_12345678901234567890",webhookSecret:"whsec_12345678901234567890",
      priceId:"price_reviewed_test"});
    expect(packs).toEqual([{priceId:"price_reviewed_test",amountUsdMinor:500,creditUnits:"500000"}]);
  });
  it("does not activate live sales merely by setting live funding mode",()=>{
    const key=process.env.LEARNOIR_STRIPE_SECRET_KEY, secret=process.env.STRIPE_WEBHOOK_SECRET;
    try{
      process.env.LEARNOIR_STRIPE_SECRET_KEY="sk_live_12345678901234567890";
      process.env.STRIPE_WEBHOOK_SECRET="whsec_12345678901234567890";
      expect(approvedZoeBuildCreditPacks("live")).toEqual([]);
    }finally{
      if(key===undefined)delete process.env.LEARNOIR_STRIPE_SECRET_KEY;else process.env.LEARNOIR_STRIPE_SECRET_KEY=key;
      if(secret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=secret;
    }
  });
});
