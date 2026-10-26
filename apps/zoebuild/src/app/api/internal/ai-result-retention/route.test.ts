import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mocks=vi.hoisted(()=>({purge:vi.fn()}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{journalOnly:"mock"}}));
vi.mock("@/lib/build/aiCreditResultRetention",()=>({purgeExpiredAiCreditResults:mocks.purge}));

import {POST} from "./route";

const KEY="ZOEBUILD_AI_RESULT_RETENTION_SECRET";
const saved=process.env[KEY];
const secret="a".repeat(48);
const request=(authorization?:string)=>new Request("http://localhost:3004/api/internal/ai-result-retention",{
  method:"POST",headers:authorization?{authorization}:{},
});

beforeEach(()=>{process.env[KEY]=secret;mocks.purge.mockReset();});
afterEach(()=>{if(saved===undefined)delete process.env[KEY];else process.env[KEY]=saved;});

describe("V12J.11D retention authorization and bounded cleanup route",()=>{
  it("rejects missing, incorrect or malformed bearer without touching the database",async()=>{
    for(const auth of [undefined,"Basic abc","Bearer wrong","Bearer "+secret.slice(0,-1),
      "Bearer "+secret+"more","Bearer  "+secret]){
      const r=await POST(request(auth));
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ok:false,code:"MAINTENANCE_UNAUTHORIZED"});
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("fails closed for missing or too-short dedicated secret",async()=>{
    for(const current of [undefined,"", "short"]){
      if(current===undefined)delete process.env[KEY];else process.env[KEY]=current;
      expect((await POST(request("Bearer "+secret))).status).toBe(401);
    }
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it("authorized POST invokes one bounded journal-only batch",async()=>{
    mocks.purge.mockResolvedValueOnce(4);
    const r=await POST(request("Bearer "+secret));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ok:true,deleted:4,batchCap:100});
    expect(mocks.purge).toHaveBeenCalledTimes(1);
    expect(mocks.purge).toHaveBeenCalledWith(expect.objectContaining({batchSize:100}));
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("database failures disclose no secret, identifiers, or storage details",async()=>{
    mocks.purge.mockRejectedValueOnce(new Error("private ciphertext and user info"));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const r=await POST(request("Bearer "+secret));
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ok:false,code:"MAINTENANCE_UNAVAILABLE"});
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private ciphertext");
    }finally{log.mockRestore();}
  });
});
