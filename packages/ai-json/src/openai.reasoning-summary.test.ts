import {describe,expect,it} from "vitest";
import {createOpenAiJsonTransport} from "./openai";
const complete = {id:"resp_real123",output:[{type:"reasoning",summary:[{type:"summary_text",text:"The site needs a new standalone page."}]},
  {type:"message",content:[{type:"output_text",text:'{"summary":"Made page","edits":[]}'}]}],
  usage:{input_tokens:10,output_tokens:40,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:5}}};
const sse = [
  `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({type:"response.reasoning_summary_text.delta",delta:"The site needs a "})}\n\n`,
  `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({type:"response.reasoning_summary_text.delta",delta:"new standalone page."})}\n\n`,
  `event: response.completed\ndata: ${JSON.stringify({type:"response.completed",response:complete})}\n\n`,
].join("");

describe("OpenAI authentic reasoning summaries",()=>{
  it("requests summary and streams only provider-supplied summary events",async()=>{
    let body:Record<string,unknown>={};
    const transport=createOpenAiJsonTransport({model:"gpt-5.2",apiKey:"test-key",fetchImpl:async(_url,init)=>{
      body=JSON.parse(init?.body??"{}");const bytes=new TextEncoder().encode(sse);
      return {ok:true,status:200,async text(){throw Error("not JSON response")},
        body:new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,40));controller.enqueue(bytes.slice(40));controller.close();}})};
    }});
    const deltas:string[]=[];
    const result=await transport.generateJsonText({system:"test",user:"new page",schemaName:"Page",
      requestReasoningSummary:true,onReasoningSummaryDelta:delta=>deltas.push(delta)});
    expect(body.stream).toBe(true);
    expect(body.reasoning).toEqual({summary:"auto"});
    expect(deltas).toEqual(["The site needs a ","new standalone page."]);
    expect(result.metadata.reasoningSummary).toBe("The site needs a new standalone page.");
    expect(result.text).toContain('"Made page"');
  });
  it("does not enable summary request for nonreasoning models",async()=>{
    let body:Record<string,unknown>={};
    const transport=createOpenAiJsonTransport({model:"gpt-4.1-mini",apiKey:"test-key",fetchImpl:async(_url,init)=>{
      body=JSON.parse(init?.body??"{}");const bytes=new TextEncoder().encode(sse);
      return {ok:true,status:200,async text(){return ""},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
    }});
    await transport.generateJsonText({system:"test",user:"page",schemaName:"Page",
      requestReasoningSummary:true,onReasoningSummaryDelta:()=>{}});
    expect(body).not.toHaveProperty("reasoning");
  });
  it("refuses missing completion instead of inventing reasoning",async()=>{
    const transport=createOpenAiJsonTransport({model:"gpt-5.2",apiKey:"test-key",fetchImpl:async()=>{
      const bytes=new TextEncoder().encode('event: response.reasoning_summary_text.delta\ndata: {"type":"response.reasoning_summary_text.delta","delta":"Partial"}\n\n');
      return {ok:true,status:200,async text(){return ""},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
    }});
    await expect(transport.generateJsonText({system:"test",user:"page",schemaName:"Page",
      requestReasoningSummary:true,onReasoningSummaryDelta:()=>{}})).rejects.toThrow("AI_JSON_STREAM_NO_COMPLETION");
  });
});
