import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({service:vi.fn()}));
vi.mock("@/lib/auth/buildHandoff",()=>({SESSION_COOKIE:"zb_session",requestBuilderAiCreditService:m.service}));
import {GET} from "./route";
const req=()=>new NextRequest("https://build.zoeskoul.com/api/billing/credit-packs",{headers:{cookie:"zb_session=opaque"}});
const pack={priceId:"price_reviewed",amountUsdMinor:500,creditUnits:"500000"};
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
describe("V12J.20 ZoeBuild Web-owned credit catalog bridge",()=>{
  beforeEach(()=>{vi.clearAllMocks();m.service.mockResolvedValue(respond({available:false,packs:[],mode:"off"}));});
  it("returns the authoritative inactive catalog, not fabricated credits",async()=>{
    const response=await GET(req());expect(await response.json()).toEqual({available:false,packs:[],mode:"off"});
    expect(m.service).toHaveBeenCalledWith("opaque",{action:"catalog"});
  });
  it.each(["sandbox-only","live"])("accepts empty %s mode without inventing a pack",async mode=>{
    m.service.mockResolvedValue(respond({available:false,packs:[],mode}));
    expect(await (await GET(req())).json()).toMatchObject({mode,available:false,packs:[]});
  });
  it.each(["sandbox-only","live"])("accepts independently verified %s offerings",async mode=>{
    m.service.mockResolvedValue(respond({available:true,packs:[pack],mode}));
    const response=await GET(req());expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({mode,available:true,packs:[pack]});
  });
  it("rejects a claimed available catalog without actual packs",async()=>{
    m.service.mockResolvedValue(respond({available:true,packs:[],mode:"live"}));
    expect((await GET(req())).status).toBe(503);
  });
  it("rejects duplicate prices and excessive or invalid credit values",async()=>{
    for(const packs of [[pack,pack],[{...pack,creditUnits:"9223372036854775808"}],[{...pack,creditUnits:"-10"}]]){
      m.service.mockResolvedValue(respond({available:true,packs,mode:"live"}));
      expect((await GET(req())).status).toBe(503);
    }
  });
  it("forwards expired sessions without leaking upstream content",async()=>{
    m.service.mockResolvedValue(respond({reason:"PRIVATE"},401));
    const response=await GET(req());expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  });
  it("rejects unexpected modes rather than silently converting to sandbox",async()=>{
    m.service.mockResolvedValue(respond({available:true,packs:[pack],mode:"unapproved"}));
    expect((await GET(req())).status).toBe(503);
  });
});
