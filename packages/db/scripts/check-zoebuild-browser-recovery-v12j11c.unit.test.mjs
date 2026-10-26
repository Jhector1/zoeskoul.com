import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const shell=read("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const helper=read("apps/zoebuild/src/lib/build/aiBrowserAttemptRecovery.ts");
const retention=read("apps/zoebuild/src/lib/build/aiCreditResultRetention.ts");
const route=read("apps/zoebuild/src/app/api/internal/ai-result-retention/route.ts");
const pricing=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
test("after server project context, client obtains stable attempt and freezes intent history",()=>{
 assert.ok(shell.indexOf("const current = payload.project")<shell.indexOf("getOrCreateAiBrowserAttempt({"));
 assert.match(shell,/previousInstructions: attempt.previousInstructions/);
 assert.match(shell,/sourceVersion:current.sourceVersion/);
});
test("same authenticated logical ID is shared by intent, edit and plan",()=>{
 assert.match(shell,/\[ZOE_AI_OPERATION_HEADER\]: billingOperationId/g);
 assert.match(shell,/\}, billingOperationId\)/);
});
test("completed attempts are cleared; uncertain errors keep pending identity",()=>{
 assert.match(shell,/const commitCompletedAttempt=/);
 assert.ok(shell.match(/commitCompletedAttempt\(\)/g).length>=4);
 const catchStart=shell.indexOf("} catch (error) {",shell.indexOf("async function planChange"));
 assert.ok(catchStart>0);
 assert.doesNotMatch(shell.slice(catchStart,shell.indexOf("} finally {",catchStart)),/completeAiBrowserAttempt|commitCompletedAttempt/);
});
test("storage holds only digest, UUID, short-lived history, never current prompt or provider output",()=>{
 assert.match(helper,/sessionStorage/);
 assert.match(helper,/SHA-256/);
 assert.doesNotMatch(helper,/localStorage|indexedDB|providerRaw|OPENAI_API_KEY/);
 assert.doesNotMatch(helper,/prompt:input.prompt/);
});
test("maintenance endpoint is bearer protected, constant-time and limited to one bounded batch",()=>{
 assert.match(route,/timingSafeEqual/);assert.match(route,/authorized\(req\)/);
 assert.match(route,/MAINTENANCE_UNAUTHORIZED/);assert.match(route,/batchSize:CAP/);
 assert.match(route,/const CAP=100/);assert.match(retention,/FOR UPDATE SKIP LOCKED/);
 assert.doesNotMatch(route,/GET\(|grantAiCreditLot|settleAiCredits|OPENAI_API_KEY|STRIPE_SECRET/);
});
test("production reviewed pricing & operational approvals remain empty",()=>{
 assert.match(pricing,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*Object.freeze\(\[\]\)/);
 assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[\s\S]*?Object.freeze\(\[\]\)/);
});
test("new code introduces neither schema changes nor duplicate credit ledger",()=>{
 for(const s of [shell,helper,route]) assert.doesNotMatch(s,/grantAiCreditLot|releaseUnusedAiReservation|CREATE TABLE|prisma migrate deploy/);
});
