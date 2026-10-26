import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root = new URL("../../../", import.meta.url);
const read = rel => readFileSync(new URL(rel, root),"utf8");
const plan=read("apps/zoebuild/src/app/api/build/plan/route.ts");
const intent=read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/intent/route.ts");
const edit=read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts");
const browser=read("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const client=read("apps/zoebuild/src/lib/build/requestZoeBuildPlan.ts");
const identity=read("apps/zoebuild/src/lib/build/aiBillingOperationIdentity.ts");
const registry=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
const executor=read("apps/zoebuild/src/lib/build/meteredAiJsonExecution.ts");
test("all three required-mode AI routes enforce client logical attempt ID",()=>{
 for (const s of [plan,intent,edit]) {
   assert.match(s,/requireZoeAiBillingOperationId\(/);
   assert.match(s,/req\.headers\.get\(ZOE_AI_OPERATION_HEADER\)/);
   assert.match(s,/operationId: meteringOperationId/);
   assert.match(s,/process\.env\.ZOEBUILD_AI_CREDITS_ENFORCEMENT === "required"/);
 }
});
test("HTTP diagnostic request id is not reused as paid operation id in required mode",()=>{
 for (const s of [plan,intent,edit]) {
   assert.match(s,/const requestId = crypto\.randomUUID\(\)/);
   assert.match(s,/\s+: requestId;/);
 }
});
test("browser supplies the same logical UUID through intent, edit and plan",()=>{
 assert.match(browser,/getOrCreateAiBrowserAttempt\(\{/);
 assert.match(browser,/const billingOperationId=attempt.id/);
 assert.ok((browser.match(/\[ZOE_AI_OPERATION_HEADER\]: billingOperationId/g)??[]).length>=2);
 assert.match(browser,/}, billingOperationId\);/);
 assert.match(client,/\[ZOE_AI_OPERATION_HEADER\]: operationId/);
});
test("same-tab refresh retry freezes instruction history and clears only on completion",()=>{
 assert.match(browser,/previousInstructions: attempt.previousInstructions/);
 assert.match(browser,/const commitCompletedAttempt=/);
 assert.ok((browser.match(/commitCompletedAttempt\(\)/g)??[]).length>=4);
 assert.match(browser,/finally \{[\s\S]*?assistantRequestInFlight\.current = false/);
});
test("invalid ID aborts before attempting paid provider call",()=>{
 for (const s of [plan,intent,edit]) assert.match(s,/AI_BILLING_OPERATION_ID_REQUIRED|ZoeAiOperationIdentityError/);
 assert.match(identity,/const UUID_V4 =/);
 assert.doesNotMatch(identity,/randomUUID\(\)/);
});
test("server-owned pricing and operational registries stay empty",()=>{
 assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES/);
 assert.match(registry,/Object\.freeze\(\[\]\)/);
 assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS/);
 assert.match(ops,/Object\.freeze\(\[\]\)/);
});
test("ledger still owns reservation, provider receipt and settlement",()=>{
 for(const primitive of ["reserveAiCredits", "bindAiCreditProviderRequest", "captureAiCreditProviderResponse", "recordAiCreditPricedProviderReceipt", "settleAiCredits"]) {
   assert.match(executor,new RegExp(primitive));
 }
 for (const s of [plan,intent,edit,identity,browser,client]) assert.doesNotMatch(s,/\b(?:settleAiCredits|reserveAiCredits)\s*\(/);
});
test("no schema, Stripe, provider or price activation added in route handshake",()=>{
 for(const s of [plan,intent,edit,identity,client,browser])
   assert.doesNotMatch(s,/prisma\.\$executeRaw|stripe\.subscriptions\.|ZOEBUILD_VERIFIED_AI_BILLING_PROFILES\s*=|ZOEBUILD_APPROVED_BILLING_OPERATIONS\s*=/);
});
