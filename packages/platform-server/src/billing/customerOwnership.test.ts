import { describe, expect, it } from "vitest";
import { isVerifiedPlatformSubscriptionOwner as valid } from "./customerOwnership";
const own = { userId:"user_1", storedStripeCustomerId:"cus_1", subscriptionCustomerId:"cus_1" };
describe("platform subscription owner verification", () => {
  it("accepts the stored matching customer", () => expect(valid(own)).toBe(true));
  it("rejects a foreign customer even with a hinted user", () => expect(valid({...own, subscriptionCustomerId:"cus_other"})).toBe(false));
  it("rejects missing stored binding, blank user IDs, and conflicting Stripe metadata", () => {
    expect(valid({...own, storedStripeCustomerId:null})).toBe(false);
    expect(valid({...own, userId:" "})).toBe(false);
    expect(valid({...own, subscriptionMetadataUserId:"user_2"})).toBe(false);
  });
});
