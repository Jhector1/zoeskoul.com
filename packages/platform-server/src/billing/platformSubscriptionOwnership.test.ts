import {describe,expect,it} from "vitest";
import {verifiedPlatformSubscriptionRows} from "./platformSubscriptionOwnership";
const rows=[
  {stripeCustomerId:"cus_owner",priceId:"price_builder",id:"own"},
  {stripeCustomerId:"cus_foreign",priceId:"price_builder",id:"foreign"},
  {stripeCustomerId:"cus_owner",priceId:"price_learning",id:"learning"},
];
describe("canonical platform subscription ownership",()=>{
  it("only returns rows bound to the server-stored customer",()=>{
    expect(verifiedPlatformSubscriptionRows({storedStripeCustomerId:"cus_owner",rows}).map(r=>r.id))
      .toEqual(["own","learning"]);
  });
  it("does not infer ownership from product price or a different customer",()=>{
    expect(verifiedPlatformSubscriptionRows({storedStripeCustomerId:"cus_foreign",rows}).map(r=>r.id))
      .toEqual(["foreign"]);
  });
  it("fails closed when there is no verified customer binding",()=>{
    expect(verifiedPlatformSubscriptionRows({storedStripeCustomerId:null,rows})).toEqual([]);
    expect(verifiedPlatformSubscriptionRows({storedStripeCustomerId:"  ",rows})).toEqual([]);
  });
  it("does not mutate input records",()=>{
    const snapshot=JSON.stringify(rows);
    verifiedPlatformSubscriptionRows({storedStripeCustomerId:"cus_owner",rows});
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
