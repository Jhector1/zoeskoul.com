import {describe,it,expect,vi} from "vitest";
import type { AiJsonTextResult, AiJsonTransport } from "@zoeskoul/ai-json";
import {validateRealProviderProbeConfig,gatherOpenAiProviderEvidence,validateActualProviderUsage,
  REAL_PROVIDER_GLOBAL_ENDPOINT,REAL_PROVIDER_OUTPUT_TOKEN_CAP,
  type RealProviderEvidence} from "./realOpenAiUsageEvidence";

const approved = {provider:"openai",model:"model-sample",approvedModel:"model-sample",apiKey:"unit-test-placeholder",
  approval:"V12J11A_SINGLE_REAL_REQUEST_APPROVED",runtimeNodeEnv:"test",creditsEnforcement:"disabled"};
const sample:AiJsonTextResult={text:JSON.stringify({ok:true,probe:"zoebuild-v12j11a"}),
  metadata:{provider:"openai",model:"model-sample",temperature:0,schemaName:"Probe",serviceTier:"default",
    providerResponseId:"resp_example",providerHttpRequestId:"req_example"},
  usage:{provider:"openai",inputTokens:28,outputTokens:12,cachedInputTokens:0,
    cacheWriteInputTokens:0,reasoningOutputTokens:0,providerRaw:{}}};
function fakeTransport(counted=29):{transport:AiJsonTransport;count:ReturnType<typeof vi.fn>;generate:ReturnType<typeof vi.fn>} {
 const count=vi.fn(async()=>counted),generate=vi.fn(async()=>sample);
 const transport:AiJsonTransport={providerId:"openai",model:"model-sample",billingEndpointBaseUrl:REAL_PROVIDER_GLOBAL_ENDPOINT,
   capabilities:{text:true,image:true,audio:false,video:false},countInputTokens:count,generateJsonText:generate};
 return {transport,count,generate};
}

describe("V12J.11A real provider evidence boundaries (offline)",()=>{
 it("requires exact operator approval, provider, model and development scope",()=>{
   expect(validateRealProviderProbeConfig(approved)).toEqual({model:"model-sample"});
   for(const patch of [{approval:""},{provider:"gemini"},{approvedModel:"other"},{runtimeNodeEnv:"production"},
      {creditsEnforcement:"required"},{apiKey:""}])
     expect(()=>validateRealProviderProbeConfig({...approved,...patch})).toThrow();
 });
 it("uses provider count before exactly one bounded generation",async()=>{
   const {transport,count,generate}=fakeTransport();
   const evidence=await gatherOpenAiProviderEvidence({model:"model-sample",transport});
   expect(count).toHaveBeenCalledOnce();expect(generate).toHaveBeenCalledOnce();
   expect(count.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
   expect(generate.mock.calls[0][0].maxOutputTokens).toBe(REAL_PROVIDER_OUTPUT_TOKEN_CAP);
   expect(generate.mock.calls[0][0].serviceTier).toBe("default");
   expect(evidence.billedInputTokens).toBe(28);
   expect(evidence.responseIdDigest).toMatch(/^[a-f0-9]{16}$/);
 });
 it("refuses excess input counts without dispatch",async()=>{
   const {transport,generate}=fakeTransport(9999);
   await expect(gatherOpenAiProviderEvidence({model:"model-sample",transport})).rejects.toThrow("REAL_PROVIDER_INPUT_COUNT_OVER_CAP");
   expect(generate).not.toHaveBeenCalled();
 });
 it("refuses non-first-party endpoints before any request",async()=>{
   const {transport,count,generate}=fakeTransport();
   await expect(gatherOpenAiProviderEvidence({model:"model-sample",transport:{...transport,billingEndpointBaseUrl:"https://proxy.invalid/v1"}})).rejects.toThrow("REAL_PROVIDER_TRANSPORT_UNVERIFIED");
   expect(count).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();
 });
 it("rejects missing IDs, tier mismatches, unbounded output and malformed JSON",()=>{
   for(const changed of [
     {...sample,metadata:{...sample.metadata,providerResponseId:undefined}},
     {...sample,metadata:{...sample.metadata,serviceTier:"priority"}},
     {...sample,usage:{...sample.usage!,outputTokens:REAL_PROVIDER_OUTPUT_TOKEN_CAP+1}},
     {...sample,text:"not-json"},
   ]) expect(()=>validateActualProviderUsage({result:changed,model:"model-sample",counted:29})).toThrow();
 });
 it("does not log response text or raw provider payload in evidence",()=>{
    const got:RealProviderEvidence=validateActualProviderUsage({result:sample,model:"model-sample",counted:29});
    expect(JSON.stringify(got)).not.toContain("resp_example");
    expect(JSON.stringify(got)).not.toContain("zoebuild-v12j11a");
    expect(JSON.stringify(got)).not.toContain("providerRaw");
 });
});
