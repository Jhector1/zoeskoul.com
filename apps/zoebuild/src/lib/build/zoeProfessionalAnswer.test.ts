import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {encodeZoeAnswerEvents,readZoeAnswerEventStream} from "./zoeAnswerEventStream";
import {parseZoeChatSubmission} from "./zoeChatHistoryContract";
import {parseZoeSemanticIntent} from "./zoeSemanticIntent";
const source=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const id="10372f53-65e6-4ba8-883d-2f5748d72210";

describe("E17L.5 professional answer architecture",()=>{
  it("routes informational messages without stuffing long answers into a classifier",()=>{
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:""}).action).toBe("answer");
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:"A long speculative answer"}).reply).toBe("");
    const intent=source("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts");
    expect(intent).toContain('"For action=answer return reply as an empty string');
    const shell=source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(shell).toContain('semantic.action === "answer"');
    expect(shell).toContain('readZoeAnswerEventStream(answerResponse)');
    expect(shell).toContain('commitCompletedAttempt();\n        addMessage(completeAnswer)');
  });
  it("handles a professional length answer and unicode without truncation",async()=>{
    const long='```java\n'+'System.out.println("Hello 🌍");\n'.repeat(500)+'```';
    const stream=encodeZoeAnswerEvents(long);
    const text=await readZoeAnswerEventStream(new Response(stream,{headers:{"Content-Type":"text/event-stream"}}));
    expect(text).toBe(long);
    expect(parseZoeChatSubmission({clientTurnId:id,role:"assistant",text})?.text).toBe(long);
  });
  it("rejects truncated streams instead of storing incomplete answers",async()=>{
    const response=new Response('event: delta\ndata: {"text":"part"}\n\n',{headers:{"Content-Type":"text/event-stream"}});
    await expect(readZoeAnswerEventStream(response)).rejects.toThrow(/before completion/);
  });
  it("requires canonical owner and entitlement gates on the second operation",()=>{
    const route=source("../../app/api/build/projects/[buildProjectId]/assistant/answer/route.ts");
    for(const fragment of ["getBuildProjectCommand(","resolveBuildAccess(access).canEditWithAi",
      "enforceSameOriginPost(req)","requireZoeAiBillingOperationId",'purpose:"answer"',
      "createRequiredZoeBuildAssistantTransport", "ZOE_CHAT_MESSAGE_MAX_UTF8_BYTES"])
      expect(route).toContain(fragment);
    expect(route).not.toContain("directProviderCall");
    const metering=source("./serverOwnedZoeBuildMetering.ts");
    expect(metering).toContain('purpose: "intent" | "edit" | "answer"');
  });
});
