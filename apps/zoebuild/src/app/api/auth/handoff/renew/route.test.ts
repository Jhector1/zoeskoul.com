import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ renew: vi.fn(), origin: vi.fn() }));
vi.mock("@zoeskoul/platform-server/http", () => ({enforceSameOriginPost:mocks.origin}));
vi.mock("@/lib/auth/buildHandoff", () => ({
  SESSION_COOKIE:"__Host-zoebuild-session", SESSION_SECONDS:86400,
  renewBuilderSession:mocks.renew,
}));
import { NextRequest } from "next/server";
import { POST } from "./route";
const request=()=>new NextRequest("https://build.zoeskoul.com/api/auth/handoff/renew",{
  method:"POST", headers:{cookie:"__Host-zoebuild-session=opaque-value",origin:"https://build.zoeskoul.com"},
});
describe("V12J.12B Builder host-only cookie renewal",()=>{
  beforeEach(()=>{mocks.renew.mockReset();mocks.origin.mockReset();mocks.origin.mockReturnValue(true);});
  it("rejects cross-origin requests before invoking authority",async()=>{
    mocks.origin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it("extends host-only cookie only after the Web authority proves the session",async()=>{
    mocks.renew.mockResolvedValue({kind:"authenticated",session:{authenticated:true,
      user:{id:"u1",email:null,name:null,image:null},roles:[],capabilities:[]}});
    const response=await POST(request());
    expect(response.status).toBe(200);
    const cookie=response.headers.get("set-cookie")??"";
    expect(cookie).toContain("__Host-zoebuild-session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=86400");
    expect(await response.json()).toMatchObject({authenticated:true,user:{id:"u1"}});
  });
  it("keeps stale cookie for explicit handoff on true expiry",async()=>{
    mocks.renew.mockResolvedValue({kind:"expired"});
    const response=await POST(request());
    expect(response.status).toBe(401);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("does not clear the cookie or claim logout on backend outage",async()=>{
    mocks.renew.mockResolvedValue({kind:"unavailable"});
    const response=await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
