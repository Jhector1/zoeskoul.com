import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
describe("V12K3B frozen retry and safe old-attempt audit",()=>{
 it("saves the exact pre-request context but never the current prompt in journal",()=>{
  const code=read("./aiBrowserAttemptRecovery.ts");
  expect(code).toContain("conversation:readonly string[];");
  expect(code).toContain("conversation=validatedConversation(input.conversation)");
  expect(code).toContain("conversation:same.conversation===undefined?null");
  expect(code).toContain("AI_ATTEMPT_CONVERSATION_INVALID");
 });
 it("the browser reuses the frozen context and does not clear older uncertain identities",()=>{
  const code=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
  expect(code).toContain("conversation:precedingHistory");
  expect(code).toContain("attempt.conversation === null");
  expect(code).toContain("No new AI request was sent or billed by this retry");
  expect(code).toContain("history:attempt.conversation ?? requestConversationRef.current?.history ?? precedingHistory");
  expect(code).toContain("completeAiBrowserAttempt({storage:window.sessionStorage");
 });
 it("read-only status queries only owner-scoped canonical ledger identities",()=>{
  const code=read("../../app/api/build/projects/[buildProjectId]/assistant/attempt-status/route.ts");
  expect(code).toContain("requireAuthority:true");
  expect(code).toContain("getBuildProjectCommand({access,buildProjectId");
  expect(code).toContain("userId:access.userId,idempotencyKey:{in:keys}");
  expect(code).toContain("prisma.aiCreditReservation.findMany");
  expect(code).not.toContain("updateMany(");
  expect(code).not.toContain("settleAiCredits");
  expect(code).not.toContain("completeAiBrowserAttempt");
  expect(code).toContain('"unrecorded"');
 });
});
