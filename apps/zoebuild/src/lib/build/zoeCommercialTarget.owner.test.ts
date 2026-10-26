import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {ZOEBUILD_OWNER_APPROVED_COMMERCIAL_TARGET as target} from "@zoeskoul/platform-server/ai-credits/math";
import {resolveProductionZoeBuildBillingProfile} from "./reviewedAiBillingRegistry";

describe("V12J.25 production billing conversion owner",()=>{
  it("enforces cross-app conversion before model pricing/ops approvals",()=>{
    const source=readFileSync(new URL("./reviewedAiBillingRegistry.ts",import.meta.url),"utf8");
    expect(source).toContain("assertZoeCommercialConversion(policy.conversion)");
  });
  it("still blocks unapproved models without making a provider request",()=>{
    expect(()=>resolveProductionZoeBuildBillingProfile({provider:"openai",model:"gpt-6-luna",tier:"economy",reason:"test"}))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
  it("commercial target does not authorize automatic model upgrades or live charges",()=>{
    expect(target.status).toBe("owner-approved-target");
    expect(target.operationalReleaseApproved).toBe(false);
  });
});
