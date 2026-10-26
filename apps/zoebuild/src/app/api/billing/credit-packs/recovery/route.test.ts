import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({origin:vi.fn(),service:vi.fn()}));
vi.mock("@zoeskoul/platform-server/billing/platformBillingRequest",()=>({isTrustedBillingMutation:m.origin}));
vi.mock("@/lib/auth/buildHandoff",()=>({SESSION_COOKIE:"__Host-zoebuild-session",requestBuilderAiCreditService:m.service}));
import {NextRequest} from "next/server";
import {POST} from "./route";
const body={action:"status",purchaseKind:"custom",amountUsdMinor:725,
  checkoutAttemptId:"zb-ai-123e4567-e89b-42d3-a456-426614174000"};
const req=(input:unknown,options?:{origin?:string;cookie?:string})=>new NextRequest("https://build.zoeskoul.com/api/billing/credit-packs/recovery",{
  method:"POST",headers:{origin:options?.origin??"https://build.zoeskoul.com",
    ...(options?.cookie===undefined?{cookie:"__Host-zoebuild-session=opaque"}:options.cookie?{cookie:options.cookie}:{}),
    "content-type":"application/json"},body:JSON.stringify(input),
});
describe("V12J29B authenticated credit recovery proxy",()=>{
  beforeEach(()=>{vi.clearAllMocks();m.origin.mockReturnValue(true);});
  it("blocks foreign origins and missing sessions before Web",async()=>{
    m.origin.mockReturnValue(false);expect((await POST(req(body))).status).toBe(403);
    m.origin.mockReturnValue(true);expect((await POST(req(body,{cookie:""}))).status).toBe(401);
    expect(m.service).not.toHaveBeenCalled();
  });
  it("rejects malformed action, amount, attempt id",async()=>{
    for(const data of [{...body,action:"checkout"},{...body,amountUsdMinor:499},
      {...body,checkoutAttemptId:"bad"}])expect((await POST(req(data))).status).toBe(400);
    expect(m.service).not.toHaveBeenCalled();
  });
  it("uses host session, never caller user ID",async()=>{
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"open",url:"https://checkout.stripe.com/c/pay/good"})});
    const result=await POST(req({...body,userId:"attacker"}));expect(result.status).toBe(200);
    expect(m.service).toHaveBeenCalledWith("opaque",body);
  });
  it("preserves Stripe Checkout session fragments needed to resume an unpaid payment",async()=>{
    const stripeUrl="https://checkout.stripe.com/c/pay/cs_test_recovery123#fidkdWx-opaque";
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"open",url:stripeUrl})});
    const response=await POST(req(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({state:"open",url:stripeUrl});
  });
  it("rejects attacker subdomains and embedded credentials in resumption URLs",async()=>{
    for(const url of ["https://checkout.stripe.com.attacker.example/c/pay/cs_test_fake#fidkdWx",
      "https://user:pass@checkout.stripe.com/c/pay/cs_test_fake#fidkdWx"]){
      m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"open",url})});
      expect((await POST(req(body))).status).toBe(503);
    }
  });
  it("does not proxy malicious Stripe URL",async()=>{
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"open",url:"https://attacker.example/"})});
    expect((await POST(req(body))).status).toBe(503);
  });
  it("allows release only when server returns true",async()=>{
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({released:true})});
    expect(await (await POST(req({...body,action:"release"}))).json()).toEqual({released:true});
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({released:false})});
    expect((await POST(req({...body,action:"release"}))).status).toBe(503);
  });
  it("preserves verified funded state from canonical Web service",async()=>{
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"funded"})});
    expect(await (await POST(req(body))).json()).toEqual({state:"funded"});
  });
  it("proxies only validated legacy fixed-price recovery",async()=>{
    const fixed={action:"status",purchaseKind:"fixed",priceId:"price_old123",checkoutAttemptId:body.checkoutAttemptId};
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({state:"expired_unpaid"})});
    expect(await (await POST(req(fixed))).json()).toEqual({state:"expired_unpaid"});
    expect(m.service).toHaveBeenCalledWith("opaque",fixed);
    for(const invalid of [{...fixed,priceId:"bad"},{...fixed,amountUsdMinor:500},{...fixed,purchaseKind:"live"}])
      expect((await POST(req(invalid))).status).toBe(400);
  });
  it("allows explicit cancel only with a server-approved response",async()=>{
    const cancel={...body,action:"cancel"};
    m.service.mockResolvedValue({ok:true,status:200,json:async()=>({safeToRelease:true,wasFunded:false})});
    expect(await (await POST(req(cancel))).json()).toEqual({safeToRelease:true,wasFunded:false});
    expect(m.service).toHaveBeenCalledWith("opaque",cancel);
    m.service.mockResolvedValue({ok:false,status:409,json:async()=>({code:"CHECKOUT_NOT_SAFE_TO_CANCEL"})});
    expect((await POST(req(cancel))).status).toBe(409);
    m.origin.mockReturnValue(false);
    expect((await POST(req(cancel))).status).toBe(403);
  });
  it("does not expose upstream exceptions",async()=>{
    m.service.mockRejectedValue(new Error("STRIPE_SECRET"));
    const result=await POST(req(body));expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("STRIPE_SECRET");
  });
});
