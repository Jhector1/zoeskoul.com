import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const root="apps/zoebuild/src/";
const intent=readFileSync(root+"app/api/build/projects/[buildProjectId]/assistant/intent/route.ts","utf8");
const edit=readFileSync(root+"app/api/build/projects/[buildProjectId]/assistant/edit/route.ts","utf8");
const browser=readFileSync(root+"app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx","utf8");
const selector=readFileSync(root+"lib/build/firstReviewedPaidEditModelV12J16B.ts","utf8");
const meter=readFileSync(root+"lib/build/serverOwnedZoeBuildMetering.ts","utf8");
const ops=readFileSync(root+"lib/build/productionAiBillingReadiness.ts","utf8");
const funding=readFileSync(root+"lib/build/verifiedAiCreditReservationPolicy.ts","utf8");
test("required intent and targeted edit both select exact reviewed Luna before transport",()=>{
  assert.match(intent,/const selectedTransport = requiredMetering\s*\? createZoeBuildAiJsonTransport\(resolveFirstReviewedPaidEditModel\(\)\)\s*: intentTransport\(\)/);
  assert.match(edit,/const selectedTransport = requiredMetering\s*\? createZoeBuildAiJsonTransport\(resolveFirstReviewedPaidEditModel\(\)\)\s*: editingTransport\(prompt\)/);
  assert.match(selector,/resolveProductionZoeBuildBillingProfile\(FIRST_EDIT_MODEL, occurredAt\)/);
  assert.match(selector,/model:\s*"gpt-6-luna"/);
});
test("each route retains owner, entitlement, project version and same-origin checks",()=>{
  for(const route of [intent,edit]){
    assert.match(route,/enforceSameOriginPost\(req\)/);
    assert.match(route,/loadCurrentBuildAccessSnapshot\(req\)/);
    assert.match(route,/canEditWithAi/);
    assert.match(route,/getBuildProjectCommand/);
    assert.match(route,/sourceVersion !== baseVersion/);
    assert.match(route,/requireZoeAiBillingOperationId/);
    assert.match(route,/createRequiredZoeBuildAssistantTransport/);
  }
});
test("billing unavailable is explicit and never downgrades to a free model",()=>{
  for(const route of [intent,edit]){
    assert.match(route,/BUILD_AI_BILLING_NOT_READY/);
    assert.match(route,/ZoeBuildBillingRegistryError/);
    assert.match(route,/ZoeBuildOperationalReadinessError/);
    assert.match(route,/ZoeBuildPublishedPriceError/);
    assert.doesNotMatch(route,/catch[^\n]*\{[^}]*editingTransport\(/);
  }
});
test("browser preserves one logical attempt and uses distinct billed purpose keys",()=>{
  assert.match(browser,/const billingOperationId=attempt\.id/);
  assert.match(browser,/ZOE_AI_OPERATION_HEADER\]: billingOperationId/g);
  assert.match(browser,/BUILD_AI_BILLING_NOT_READY/);
  assert.match(meter,/const idempotencyKey = `\$\{input.operationId\}:\$\{input.purpose\}`/);
  assert.match(meter,/executeMeteredAiJsonRequest/);
});
test("billing registries remain empty and no provider, wallet or subscription writes added",()=>{
  assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[^\n]*\[\][\s\S]*?Object\.freeze\(\[\]\)/);
  assert.match(funding,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES:[^\n]*\[\][\s\S]*?Object\.freeze\(\[\]\)/);
  for(const route of [intent,edit])assert.doesNotMatch(route,/NODE_ENV|grantAiCreditLot|STRIPE_WEBHOOK_SECRET/);
});
test("paid intent and edit do not silently route to extra providers",()=>{
  assert.match(intent,/\? createZoeBuildAiJsonTransport\(resolveFirstReviewedPaidEditModel\(\)\)/);
  assert.match(edit,/\? createZoeBuildAiJsonTransport\(resolveFirstReviewedPaidEditModel\(\)\)/);
  assert.match(selector,/maxCombinedInputTokens > 20_000/);
  assert.match(selector,/maxOutputTokens > 4_096/);
});
