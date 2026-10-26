import { describe, expect, it } from "vitest";
import { checkPlatformStripeEventEnvironment as check } from "./platformStripeEventEnvironment";

describe("platform Stripe webhook environment isolation", () => {
  it("accepts a signed test-mode event only under a test-mode platform key", () => {
    expect(check({secretKey:"sk_test_sample",event:{livemode:false}})).toBe("accepted");
  });
  it("accepts live events only under an explicitly live Stripe key", () => {
    expect(check({secretKey:"sk_live_sample",event:{livemode:true}})).toBe("accepted");
  });
  it("rejects both directions of cross-mode delivery", () => {
    expect(check({secretKey:"sk_test_sample",event:{livemode:true}})).toBe("mode_mismatch");
    expect(check({secretKey:"sk_live_sample",event:{livemode:false}})).toBe("mode_mismatch");
  });
  it("fails closed if the platform secret is unset or has an unknown prefix", () => {
    for(const key of [undefined,null,"","sk_test_","sk_live_","rk_test_sample","whsec_sample"]){
      expect(check({secretKey:key,event:{livemode:false}})).toBe("unconfigured");
    }
  });
  it("never accepts events without a valid livemode field", () => {
    expect(check({secretKey:"sk_test_sample",event:{livemode:null}})).toBe("mode_mismatch");
    expect(check({secretKey:"sk_test_sample",event:{livemode:"false"}})).toBe("mode_mismatch");
  });
  it("does not process connected-account merchant events as platform billing", () => {
    expect(check({secretKey:"sk_test_sample",event:{livemode:false,account:"acct_merchant"}})).toBe("connected_account");
  });
});
