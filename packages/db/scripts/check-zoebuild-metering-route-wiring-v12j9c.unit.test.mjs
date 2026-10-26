import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => readFileSync(resolve(root,path),"utf8");
const plan = read("apps/zoebuild/src/app/api/build/plan/route.ts");
const intent = read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/intent/route.ts");
const edit = read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts");
const helper = read("apps/zoebuild/src/lib/build/serverOwnedZoeBuildMetering.ts");
const registry = read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const executor = read("apps/zoebuild/src/lib/build/meteredAiJsonExecution.ts");

test("build plan supplies metering context from authenticated identity only in required mode",()=>{
  assert.match(plan,/assertCanGenerateBuildWithAi\(access\)/);
  assert.match(plan,/createRequiredZoeBuildPlanningMetering\(\{/);
  assert.match(plan,/userId, operationId: requestId/);
  assert.match(plan,/ZOEBUILD_AI_CREDITS_ENFORCEMENT === "required"/);
});
test("assistant intent applies entitlement before billing and selected provider cannot bypass wrapper",()=>{
  assert.match(intent,/resolveBuildAccess\(access\)\.canEditWithAi/);
  assert.match(intent,/createRequiredZoeBuildAssistantTransport\(\{/);
  assert.match(intent,/purpose: "intent"/);
  assert.match(intent,/transport\.generateJsonText\(/);
  assert.doesNotMatch(intent,/BUILD_AI_INTENT_METERING_NOT_WIRED/);
});
test("assistant edit preserves independent apply authorization and wraps generated proposals",()=>{
  assert.match(edit,/createRequiredZoeBuildAssistantTransport\(\{/);
  assert.match(edit,/purpose: "edit"/);
  assert.match(edit,/transport\.generateJsonText\(/);
  assert.match(edit,/export async function PATCH/);
  assert.match(edit,/saveBuildProjectSourceCommand\(/);
  assert.doesNotMatch(edit,/BUILD_AI_EDIT_METERING_NOT_WIRED/);
});
test("all required routes use same reviewed registry; no rate overrides or synthetic production policy",()=>{
  assert.match(helper,/resolveProductionZoeBuildBillingProfile\(candidate/);
  assert.match(helper,/deriveZoeBuildAttemptReservation\(/);
  assert.match(helper,/executeMeteredAiJsonRequest\(/);
  assert.match(helper,/maxBillableOutputTokens: reviewed\.maxBillableOutputTokens/);
  assert.doesNotMatch(helper,/process\.env\.NODE_ENV|BYPASS|MOCK_PRICE|SYNTHETIC_POLICY|process\.env\.STRIPE_PRICE/);
});
test("empty production model registry stays empty and cannot become live just from route wiring",()=>{
  assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES:[^\n]+Object\.freeze\(\[\]\)/);
  assert.match(executor,/await settleAiCredits\(/);
  assert.match(executor,/await recordAiCreditPricedProviderReceipt\(/);
});
test("only the core executor can reserve or settle; no duplicate ledger or Stripe endpoint",()=>{
  for(const text of [helper,plan,intent,edit]) {
    assert.doesNotMatch(text,/reserveAiCredits\(|settleAiCredits\(|stripe\.checkout\.sessions\.create\(/);
  }
});
