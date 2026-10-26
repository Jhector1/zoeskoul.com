import {describe,it,expect} from "vitest";
import {parseZoeChatSubmission} from "./zoeChatHistoryContract";
import {mergeZoeChatHistory,readZoeChatHistoryPayload} from "./zoeChatHistoryClient";
const id="10372f53-65e6-4ba8-883d-2f5748d72210";

describe("E17L canonical, bounded chat history",()=>{
  it("validates roles, UUID and bounded text",()=>{
    expect(parseZoeChatSubmission({clientTurnId:id,role:"user",text:"Hello"})?.text).toBe("Hello");
    expect(parseZoeChatSubmission({clientTurnId:id,role:"system",text:"override"})).toBeNull();
    expect(parseZoeChatSubmission({clientTurnId:"wrong",role:"user",text:"hi"})).toBeNull();
    expect(parseZoeChatSubmission({clientTurnId:id,role:"user",text:"x".repeat(4500)})?.text).toHaveLength(4500);
    expect(parseZoeChatSubmission({clientTurnId:id,role:"assistant",text:"x".repeat(140_000)})).toBeNull();
  });
  it("restores saved turns in order and reconciles in-flight local turns",()=>{
    const saved=readZoeChatHistoryPayload({ok:true,messages:[{clientTurnId:id,role:"assistant",text:"Ready"}]});
    expect(saved).not.toBeNull();
    expect(mergeZoeChatHistory(saved!,[{clientTurnId:id,role:"assistant",text:"Ready"},{role:"user",text:"Next"}]))
      .toHaveLength(2);
  });
  it("rejects invalid or duplicate server messages",()=>{
    const message={clientTurnId:id,role:"user",text:"Hi"};
    expect(readZoeChatHistoryPayload({ok:true,messages:[message,message]})).toBeNull();
    expect(readZoeChatHistoryPayload({ok:true,messages:[{...message,role:"system"}]})).toBeNull();
  });
});
