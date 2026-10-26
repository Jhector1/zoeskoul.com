/**
 * V12J.11A opt-in REAL OpenAI usage evidence. Two network calls maximum:
 * one /responses/input_tokens and one /responses. No database/Stripe/ledger.
 * The generation may incur real provider charges on the operator's API account.
 */
import {describe,it,expect} from "vitest";
import {gatherOpenAiProviderEvidence,makeRealOpenAiProviderTransport,
  validateRealProviderProbeConfig,REAL_PROVIDER_GLOBAL_ENDPOINT,
  REAL_PROVIDER_OUTPUT_TOKEN_CAP} from "./realOpenAiUsageEvidence";
const enabled=process.env.ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_RUN==="V12J11A_SINGLE_REAL_REQUEST_APPROVED";

describe.runIf(enabled)("V12J.11A actual OpenAI provider token count + paid response",()=>{
 it("uses exactly one bounded provider response with real returned usage",async()=>{
   const {model}=validateRealProviderProbeConfig({
     provider:process.env.ZOEBUILD_AI_PROVIDER,
     model:process.env.ZOEBUILD_AI_MODEL,
     approvedModel:process.env.ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_MODEL,
     apiKey:process.env.OPENAI_API_KEY,
     approval:process.env.ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_RUN,
     runtimeNodeEnv:process.env.NODE_ENV,
     creditsEnforcement:process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT,
   });
   let calls=0,countCalls=0,responseCalls=0;
   const transport=makeRealOpenAiProviderTransport({model,apiKey:process.env.OPENAI_API_KEY!,
     fetchImpl:async(url,options)=>{
       calls++;
       const path=new URL(url);
       if (path.origin!=="https://api.openai.com" || options?.method!=="POST" ||
           calls>2 || !options?.body) throw Error("REAL_PROVIDER_UNEXPECTED_REQUEST");
       let body:Record<string,unknown>;
       try{ body=JSON.parse(options.body) as Record<string,unknown>; }
       catch { throw Error("REAL_PROVIDER_REQUEST_NOT_JSON"); }
       if(body.model!==model || typeof body.instructions!=="string" ||
          !Array.isArray(body.input) || !body.text || body.input.length!==1)
         throw Error("REAL_PROVIDER_UNEXPECTED_REQUEST_BODY");
       if(path.pathname==="/v1/responses/input_tokens"){
         countCalls++;
         if(calls!==1 || "max_output_tokens" in body || "service_tier" in body ||
             "store" in body) throw Error("REAL_PROVIDER_COUNT_ENVELOPE_MISMATCH");
       } else if(path.pathname==="/v1/responses"){
         responseCalls++;
         if(calls!==2 || body.max_output_tokens!==REAL_PROVIDER_OUTPUT_TOKEN_CAP ||
             body.service_tier!=="default" || body.store!==false ||
             !options.headers?.["X-Client-Request-Id"])
           throw Error("REAL_PROVIDER_UNBOUNDED_GENERATION");
       } else throw Error("REAL_PROVIDER_ENDPOINT_UNEXPECTED");
       // Preserve our existing first-party serialization/usage parser, but bound
       // the network probe's time and reject redirects to other hosts.
       return fetch(url,{...options,signal:AbortSignal.timeout(45_000),redirect:"error"});
     },
   });
   expect(transport.billingEndpointBaseUrl).toBe(REAL_PROVIDER_GLOBAL_ENDPOINT);
   try {
     const evidence=await gatherOpenAiProviderEvidence({model,transport});
     expect(calls).toBe(2);expect(countCalls).toBe(1);expect(responseCalls).toBe(1);
     expect(evidence.billedInputTokens).toBeGreaterThan(0);
     console.log("V12J11A_REAL_OPENAI_PASS "+JSON.stringify({
       ...evidence,countEndpointCalls:countCalls,paidGenerationCalls:responseCalls,
       databaseWrites:false,customerCreditCharges:false,customerBillingActivated:false,
     }));
   }catch(error){
     // Never print API keys, request contents, raw provider messages, response
     // output, or bearer-bearing HTTP init objects in CI/session logs.
     const code=error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)
       ? error.message : "REAL_PROVIDER_REQUEST_FAILED_REVIEW_SAFELY";
     console.error(`V12J11A_REAL_OPENAI_REFUSED reason=${code} countCalls=${countCalls} responseCalls=${responseCalls}`);
     throw new Error(code);
   }
 },60_000);
});
