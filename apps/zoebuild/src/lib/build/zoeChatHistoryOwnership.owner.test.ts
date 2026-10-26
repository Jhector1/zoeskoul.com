import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(s:string)=>readFileSync(new URL(s,import.meta.url),"utf8");
const api=read("../../app/api/build/projects/[buildProjectId]/assistant/history/route.ts");
const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const css=read("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.module.css");
describe("E17L auth, durable restore and scoped code styling",()=>{
  it("checks project authorization on both GET and POST before accessing messages",()=>{
    expect(api).toContain("getBuildProjectCommand(");
    expect(api).toContain("createPrismaBuildProjectReader(prisma)");
    expect(api).toContain("enforceSameOriginPost(req)");
    expect(api).toContain("BUILD_CHAT_ID_CONFLICT");
    expect(api).toContain("KEEP_MESSAGES = 120");
  });
  it("waits for project history before paying for a new AI request and orders writes",()=>{
    expect(shell).toContain("await ensureChatHistoryLoaded()");
    expect(shell).toContain("historyWritesRef.current = historyWritesRef.current.catch");
    expect(shell).toContain("serializeZoeConversationHistory(chatHistoryRef.current)");
    expect(shell).toContain("role=\"status\" className=\"zb-project-assistant-plan-error\"");
  });
  it("keeps code layout and copy controls inside the chat only",()=>{
    for (const fragment of [".markdown :global(.zoe-code-frame)",".markdown :global(.zoe-code-toolbar)",
      ".markdown :global(.zoe-code-copy svg)",".markdown :global(.zoe-code-frame pre)","overflow-x: auto"])
      expect(css).toContain(fragment);
  });
});
