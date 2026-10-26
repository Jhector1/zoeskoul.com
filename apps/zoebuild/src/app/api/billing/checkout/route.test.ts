import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),start:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.auth}));
vi.mock("@/lib/billing/platformStripeProvider",()=>({startBuilderPlatformCheckout:m.start}));
import {POST} from "./route";
const attempt="11111111-1111-4111-8111-111111111111";
function req(body:unknown={priceId:"price_builder",checkoutAttemptId:attempt,locale:"en"},origin="https://zoebuild.test"){
 return new Request("https://zoebuild.test/api/billing/checkout",{method:"POST",headers:{origin},body:JSON.stringify(body)});
}
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({userId:"me"});m.start.mockResolvedValue({kind:"created",url:"https://checkout.stripe.com/c/pay"})});
describe("ZoeBuild platform subscription checkout",()=>{
 it("rejects cross-origin POST before authentication or Stripe",async()=>{expect((await POST(req({},"https://evil.test"))).status).toBe(403);expect(m.auth).not.toHaveBeenCalled();expect(m.start).not.toHaveBeenCalled()});
 it("accepts configured Builder origin when Next request URL uses a reverse-proxy internal address",async()=>{
  vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_ORIGIN","https://zoebuild.test");
  try {
    const r=await POST(new Request("http://127.0.0.1:3004/api/billing/checkout",
      {method:"POST",headers:{origin:"https://zoebuild.test"},
       body:JSON.stringify({priceId:"price_builder",checkoutAttemptId:attempt,locale:"en"})}));
    expect(r.status).toBe(200);expect(m.start).toHaveBeenCalledTimes(1);
  } finally {vi.unstubAllEnvs();}
 });
 it("still blocks an external website even with the configured Builder origin",async()=>{
  vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_ORIGIN","https://zoebuild.test");
  try {
    const r=await POST(req({},"https://external.test"));
    expect(r.status).toBe(403);expect((await r.json()).code).toBe("BILLING_ORIGIN_MISMATCH");
    expect(m.auth).not.toHaveBeenCalled();expect(m.start).not.toHaveBeenCalled();
  } finally {vi.unstubAllEnvs();}
 });
 it("requires shared authenticated user",async()=>{m.auth.mockResolvedValue({userId:null});expect((await POST(req())).status).toBe(401);expect(m.start).not.toHaveBeenCalled()});
 it("ignores caller identity and selects authenticated user",async()=>{const r=await POST(req({userId:"victim",priceId:"price_builder",checkoutAttemptId:attempt,locale:"fr"}));expect(r.status).toBe(200);expect(m.start).toHaveBeenCalledWith({userId:"me",priceId:"price_builder",checkoutAttemptId:attempt,locale:"fr"});expect((await r.json()).url).toContain("checkout.stripe.com")});
 it("rejects malformed price and attempt identifiers",async()=>{expect((await POST(req({priceId:"price_builder",checkoutAttemptId:"bad"}))).status).toBe(400);expect((await POST(req({priceId:"price_invalid-name",checkoutAttemptId:attempt}))).status).toBe(400);expect(m.start).not.toHaveBeenCalled()});
 it("refuses duplicate active subscription",async()=>{m.start.mockResolvedValue({kind:"already_subscribed"});expect((await POST(req())).status).toBe(409)});
 it("preserves reservation after uncertain Stripe failure",async()=>{m.start.mockRejectedValue(new Error("network"));const r=await POST(req());expect(r.status).toBe(503);expect((await r.json()).code).toBe("CHECKOUT_UNAVAILABLE")});
 it("distinguishes legitimate resumed Checkout",async()=>{m.start.mockResolvedValue({kind:"resumed",url:"https://checkout.stripe.com/c/old"});expect(await (await POST(req())).json()).toMatchObject({resumed:true})});
 it("fails closed for cross-product prices",async()=>{m.start.mockRejectedValue(new Error("BILLING_PRODUCT_PRICE_NOT_ALLOWED"));expect((await POST(req())).status).toBe(400)});
});
