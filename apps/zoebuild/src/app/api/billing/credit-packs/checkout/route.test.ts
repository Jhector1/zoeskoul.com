import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({origin:vi.fn(),service:vi.fn()}));
vi.mock("@zoeskoul/platform-server/billing/platformBillingRequest",()=>({isTrustedBillingMutation:m.origin}));
vi.mock("@/lib/auth/buildHandoff",()=>({SESSION_COOKIE:"__Host-zoebuild-session",requestBuilderAiCreditService:m.service}));
import {NextRequest} from "next/server";
import {POST} from "./route";
const request=(body:unknown)=>new NextRequest("https://build.zoeskoul.com/api/billing/credit-packs/checkout",{
  method:"POST",headers:{origin:"https://build.zoeskoul.com",cookie:"__Host-zoebuild-session=opaque", "content-type":"application/json"},body:JSON.stringify(body),
});
const good={priceId:"price_test",checkoutAttemptId:"zb-ai-123e4567-e89b-42d3-a456-426614174000"};
describe("V12J.14C ZoeBuild credit checkout proxy",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.origin.mockReturnValue(true);});
 it("blocks untrusted browser origins before spending",async()=>{m.origin.mockReturnValue(false);expect((await POST(request(good))).status).toBe(403);expect(m.service).not.toHaveBeenCalled();});
 it("rejects malformed requests before contacting authority",async()=>{expect((await POST(request({...good,priceId:"bad"}))).status).toBe(400);expect(m.service).not.toHaveBeenCalled();});
 it("does not expose Web failures",async()=>{m.service.mockRejectedValue(new Error("SECRET"));const r=await POST(request(good));expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain("SECRET");});
 it("passes only exact approved Stripe URL and no browser user ID",async()=>{m.service.mockResolvedValue({status:200,ok:true,json:async()=>({url:"https://checkout.stripe.com/c/pay/cs_test_good",resumed:false})});const r=await POST(request({...good,userId:"forged"}));expect(r.status).toBe(200);expect(m.service).toHaveBeenCalledWith("opaque",{action:"checkout",...good});});
 it("forwards custom cents, not browser-provided credit units or identities",async()=>{
   m.service.mockResolvedValue({status:200,ok:true,json:async()=>({url:"https://checkout.stripe.com/c/pay/cs_test_good",resumed:false})});
   const id=good.checkoutAttemptId;
   const r=await POST(request({purchaseKind:"custom",amountUsdMinor:1725,
     checkoutAttemptId:id,userId:"forged",creditUnits:"99999999",priceId:undefined}));
   expect(r.status).toBe(200);
   expect(m.service).toHaveBeenCalledWith("opaque",{action:"checkout",purchaseKind:"custom",
     amountUsdMinor:1725,checkoutAttemptId:id});
 });
 it("rejects custom malformed amounts or conflicting fixed price",async()=>{
   for(const body of [{purchaseKind:"custom",amountUsdMinor:499},
     {purchaseKind:"custom",amountUsdMinor:50001},
     {purchaseKind:"custom",amountUsdMinor:500.1},
     {purchaseKind:"custom",amountUsdMinor:"1500"},
     {purchaseKind:"custom",amountUsdMinor:500,priceId:"price_wrong"}]){
     expect((await POST(request({...body,checkoutAttemptId:good.checkoutAttemptId}))).status).toBe(400);
   }
   expect(m.service).not.toHaveBeenCalled();
 });
 it("rejects malicious outbound redirects",async()=>{m.service.mockResolvedValue({status:200,ok:true,json:async()=>({url:"https://evil.example/charge",resumed:false})});expect((await POST(request(good))).status).toBe(503);});
});
