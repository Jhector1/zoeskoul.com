import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/lib/appOrigins",()=>({resolveZoeBuildOrigins:()=>({
  websiteOrigin:"https://web.example.test",zoebuildOrigin:"https://build.example.test",
})}));
vi.mock("@zoeskoul/api-contracts",()=>({
  isAppSessionResponse:(v:unknown)=>Boolean(v && typeof v==="object" &&
    "authenticated" in v && typeof v.authenticated==="boolean" &&
    "user" in v && "roles" in v && "capabilities" in v),
}));
import {readBuilderSessionStatus,readBuilderSession,renewBuilderSession} from "./buildHandoff";
const token="A".repeat(43);
const anonymous={authenticated:false,user:null,roles:[],capabilities:[]};
const logged={authenticated:true,user:{id:"user-self"},roles:[],capabilities:[]};
let originalSecret:string|undefined;
beforeEach(()=>{
  originalSecret=process.env.ZOESKOUL_BUILD_HANDOFF_SECRET;
  process.env.ZOESKOUL_BUILD_HANDOFF_SECRET="s".repeat(64);
});
afterEach(()=>{
  if(originalSecret===undefined)delete process.env.ZOESKOUL_BUILD_HANDOFF_SECRET;
  else process.env.ZOESKOUL_BUILD_HANDOFF_SECRET=originalSecret;
  vi.unstubAllGlobals();
});
const mockResponse=(status:number,payload:unknown)=>vi.stubGlobal("fetch",vi.fn(async()=>({
  ok:status>=200&&status<300,status,json:async()=>payload,
})));
describe("V12J.14D shared session authority status",()=>{
  it("treats missing or malformed session cookie as expired before any Web call",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect(await readBuilderSessionStatus(undefined)).toEqual({kind:"expired"});
    expect(await readBuilderSessionStatus("bad")).toEqual({kind:"expired"});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("maps valid Web denial of unknown Redis session to expired",async()=>{
    mockResponse(200,anonymous);
    expect(await readBuilderSessionStatus(token)).toEqual({kind:"expired"});
    expect((await readBuilderSession(token)).authenticated).toBe(false);
  });
  it("does not misreport Web 503 or service authorization error as expired",async()=>{
    for(const status of [401,503]){
      mockResponse(status,anonymous);
      expect(await readBuilderSessionStatus(token)).toEqual({kind:"unavailable"});
    }
  });
  it("fails closed on malformed upstream response or transport failure",async()=>{
    mockResponse(200,{nonsense:true});
    expect(await readBuilderSessionStatus(token)).toEqual({kind:"unavailable"});
    vi.stubGlobal("fetch",vi.fn(async()=>{throw new Error("offline");}));
    expect(await readBuilderSessionStatus(token)).toEqual({kind:"unavailable"});
  });
  it("accepts only server-verified identity and no new cookies or grants",async()=>{
    mockResponse(200,logged);
    expect(await readBuilderSessionStatus(token)).toEqual({kind:"authenticated",session:logged});
    expect((await renewBuilderSession(token)).kind).toBe("authenticated");
  });
});
