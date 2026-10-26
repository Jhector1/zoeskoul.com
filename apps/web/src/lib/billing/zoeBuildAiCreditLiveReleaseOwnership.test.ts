import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS,
  approvedZoeBuildCreditPacks} from "./zoeBuildAiCreditStripeFunding";
import {ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS} from "./zoeBuildAiCreditLiveReleasePolicy";

describe("V12J.26 Web owns live release approval",()=>{
  it("has no live pack or evidence signoffs",()=>{
    expect(APPROVED_ZOEBUILD_AI_LIVE_CREDIT_PACKS).toHaveLength(0);
    expect(ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS).toHaveLength(0);
  });
  it("does not enable charges from environment flags",()=>{
    const key=process.env.LEARNOIR_STRIPE_SECRET_KEY;
    const mode=process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE;
    const webhook=process.env.STRIPE_WEBHOOK_SECRET;
    try{
      process.env.LEARNOIR_STRIPE_SECRET_KEY="sk_live_fixture";
      process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE="live";
      process.env.STRIPE_WEBHOOK_SECRET="whsec_fixture";
      expect(approvedZoeBuildCreditPacks("live")).toEqual([]);
    }finally{
      if(key===undefined)delete process.env.LEARNOIR_STRIPE_SECRET_KEY;
      else process.env.LEARNOIR_STRIPE_SECRET_KEY=key;
      if(mode===undefined)delete process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE;
      else process.env.ZOEBUILD_AI_CREDIT_FUNDING_MODE=mode;
      if(webhook===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET=webhook;
    }
  });
  it("enforces evidence signoff in the Web-owned production composition",()=>{
    const code=readFileSync(new URL("./zoeBuildAiCreditStripeFunding.ts",import.meta.url),"utf8");
    expect(code).toContain("assertZoeBuildLivePackReleased({");
    expect(code).toContain("ZOEBUILD_REVIEWED_LIVE_RELEASE_RECORDS");
    expect(code).toContain("assertZoeCommercialPack(pack)");
    expect(code).not.toContain("process.env.NODE_ENV ===");
  });
});
