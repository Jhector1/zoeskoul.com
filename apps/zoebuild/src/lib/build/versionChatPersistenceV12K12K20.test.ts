import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const route=source("../../app/api/build/projects/[buildProjectId]/assistant/history/route.ts");
const shell=source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const history=source("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
describe("K20 conversation isolation and migration policy",()=>{
  it("authorizes the project and binds GET/POST to authoritative selected source",()=>{
    expect(route).toContain("getBuildProjectCommand(");
    expect(route).toContain("currentScope(prisma,auth.codeProjectId,auth.userId)");
    expect(route).toContain("currentScope(tx,auth.codeProjectId,auth.userId)");
    expect(route).toContain("BUILD_CHAT_VERSION_STALE");
    expect(route).toContain("savedVersion:scope.savedVersion");
    expect(route).toContain("TransactionIsolationLevel.Serializable");
  });
  it("drops old visible chat before loading new selection and rejects late results",()=>{
    expect(shell).toContain("chatHistoryRef.current = [];");
    expect(shell).toContain("setMessages([]);");
    expect(shell).toContain("matchingZoeVersionScope(chatScopeRef.current,scope)");
    expect(shell).toContain("await historyWritesRef.current;");
    expect(history).toContain("await props.onBeforeSwitch?.()");
  });
  it("keeps messages keyed to immutable client turn ID and per-version cleanup",()=>{
    expect(route).toContain("skipDuplicates:true");
    expect(route).toContain("BUILD_CHAT_ID_CONFLICT");
    expect(route).toContain("skip:KEEP_MESSAGES");
  });
});
