import {describe,expect,it} from "vitest";
import {createOpenAiJsonTransport} from "./openai";

const request={system:"JSON only",user:"List files",schemaName:"AgentAction",maxOutputTokens:4096,
  responseJsonSchema:{type:"object",additionalProperties:false,properties:{ok:{type:"boolean"}},required:["ok"]}};

describe("V12K10G OpenAI response completeness",()=>{
  it("rejects HTTP 200 incomplete output before returning text to the paid agent",async()=>{
    const transport=createOpenAiJsonTransport({model:"gpt-6-luna",apiKey:"test-key",
      fetchImpl:async()=>({ok:true,status:200,async text(){return JSON.stringify({
        id:"resp-incomplete",status:"incomplete",incomplete_details:{reason:"max_output_tokens"},
        service_tier:"default",output_text:'{"ok":',
      });}})});
    await expect(transport.generateJsonText(request)).rejects.toThrow("AI_JSON_RESPONSE_INCOMPLETE");
  });
  it("rejects failed or still in-progress provider output",async()=>{
    for (const status of ["failed","in_progress"]){
      const transport=createOpenAiJsonTransport({model:"gpt-6-luna",apiKey:"test-key",
        fetchImpl:async()=>({ok:true,status:200,async text(){return JSON.stringify({
          id:"resp-unknown",status,output_text:'{"ok":true}',
        });}})});
      await expect(transport.generateJsonText(request)).rejects.toThrow("AI_JSON_RESPONSE_NOT_COMPLETED");
    }
  });
  it("accepts completed provider output while retaining its response identity",async()=>{
    const transport=createOpenAiJsonTransport({model:"gpt-6-luna",apiKey:"test-key",
      fetchImpl:async()=>({ok:true,status:200,async text(){return JSON.stringify({
        id:"resp-complete",status:"completed",service_tier:"default",output_text:'{"ok":true}',
      });}})});
    const output=await transport.generateJsonText(request);
    expect(output.text).toBe('{"ok":true}');
    expect(output.metadata.providerResponseId).toBe("resp-complete");
  });
});
