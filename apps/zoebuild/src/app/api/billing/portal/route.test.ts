import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),portal:vi.fn()}));
vi.mock("@/lib/build/currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:m.auth}));
vi.mock("@/lib/billing/platformStripeProvider",()=>({createBuilderPlatformBillingPortal:m.portal}));
import {POST} from "./route";
const request=(origin="https://zoebuild.test",body=JSON.stringify({locale:"en"}))=>new Request("https://zoebuild.test/api/billing/portal",{method:"POST",headers:{origin,"content-type":"application/json"},body});
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({userId:"me"});m.portal.mockResolvedValue({url:"https://billing.stripe.com/session/ok"});});
describe("ZoeBuild platform portal",()=>{
 it("rejects cross-site mutation before querying identity",async()=>{expect((await POST(request("https://evil.test"))).status).toBe(403);expect(m.auth).not.toHaveBeenCalled();});
 it("accepts trusted configured app origin behind a reverse proxy",async()=>{
  vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_ORIGIN","https://zoebuild.test");
  try {
    const r=await POST(new Request("http://127.0.0.1:3004/api/billing/portal",{method:"POST",
      headers:{origin:"https://zoebuild.test"},body:JSON.stringify({locale:"en"})}));
    expect(r.status).toBe(200);expect(m.portal).toHaveBeenCalledTimes(1);
  } finally {vi.unstubAllEnvs();}
 });
 it("blocks other origins before authentication even if configured",async()=>{
  vi.stubEnv("NEXT_PUBLIC_ZOEBUILD_ORIGIN","https://zoebuild.test");
  try {
    const r=await POST(request("https://external.test"));
    expect(r.status).toBe(403);expect((await r.json()).code).toBe("BILLING_ORIGIN_MISMATCH");
    expect(m.auth).not.toHaveBeenCalled();
  } finally {vi.unstubAllEnvs();}
 });
 it("requires authenticated identity",async()=>{m.auth.mockResolvedValue({userId:null});expect((await POST(request())).status).toBe(401);expect(m.portal).not.toHaveBeenCalled();});
 it("opens only the authenticated user's platform portal",async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(m.portal).toHaveBeenCalledWith("me","en");expect((await r.json()).url).toContain("billing.stripe.com");});
 it("fails closed without a verified subscription",async()=>{m.portal.mockRejectedValue(Error("not subscribed"));expect((await POST(request())).status).toBe(503);});
});
