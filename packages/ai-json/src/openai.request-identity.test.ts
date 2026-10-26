import { describe, expect, it } from "vitest";
import { createOpenAiJsonTransport } from "./openai";
const result = { id: "resp-provider-123", output_text: '{"ok":true}', service_tier: "default",
  usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: {cached_tokens:0},
    output_tokens_details: {reasoning_tokens:0} } };
const base = { system:"test", user:"make JSON", schemaName:"Example", maxOutputTokens:64,
  serviceTier:"default" as const };
describe("E16C4E1B2B1 OpenAI dispatch trace", () => {
  it("sends client request header only to paid Responses; captures provider identifiers", async () => {
    const seen: Array<{ url:string; headers:Record<string,string>; body:any }> = [];
    const transport = createOpenAiJsonTransport({model:"gpt-6-luna",apiKey:"test-key",
      fetchImpl: async (url,init) => {
        seen.push({url,headers:{...init?.headers},body:JSON.parse(init?.body ?? "{}")});
        if (url.endsWith("/input_tokens")) return {ok:true,status:200,async text(){return JSON.stringify({object:"response.input_tokens",input_tokens:10});}};
        return {ok:true,status:200,headers:{get:(key:string)=>key==="x-request-id"?"req-openai-123":null},
          async text(){return JSON.stringify(result);}};
      }});
    const request = {...base,clientRequestId:"zb-123e4567-e89b-12d3-a456-426614174000"};
    await transport.countInputTokens?.(request);
    const output = await transport.generateJsonText(request);
    expect(seen).toHaveLength(2);
    expect(seen[0].headers).not.toHaveProperty("X-Client-Request-Id");
    expect(seen[1].headers["X-Client-Request-Id"]).toBe(request.clientRequestId);
    expect(seen[1].body).not.toHaveProperty("clientRequestId");
    expect(output.metadata).toMatchObject({providerResponseId:"resp-provider-123",providerHttpRequestId:"req-openai-123"});
  });
  it("refuses invalid client request header before paid network access", async () => {
    let called=0;
    const transport=createOpenAiJsonTransport({model:"gpt-6-luna",apiKey:"test-key",
      fetchImpl:async()=>{called++;throw new Error("SHOULD_NOT_CALL");}});
    await expect(transport.generateJsonText({...base,clientRequestId:"evil\nheader"}))
      .rejects.toThrow("AI_JSON_CLIENT_REQUEST_ID_INVALID");
    expect(called).toBe(0);
  });
});
