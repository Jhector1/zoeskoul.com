import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const base="apps/zoebuild/src/lib/build/";
const model=readFileSync(base+"firstReviewedPaidEditModelV12J16B.ts","utf8");
const edit=readFileSync("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts","utf8");
const testFile=readFileSync(base+"firstReviewedPaidEditModelV12J16B.test.ts","utf8");
const registry=readFileSync(base+"reviewedAiBillingRegistry.ts","utf8");
const ops=readFileSync(base+"productionAiBillingReadiness.ts","utf8");
const collector=readFileSync("packages/db/scripts/collect-zoebuild-paid-edit-ui-v12j16b.py","utf8");
test("paid targeted editing selects exact compiled-reviewed Luna, not arbitrary routed provider",()=>{
  assert.match(edit,/requiredMetering\s*\? createZoeBuildAiJsonTransport\(resolveFirstReviewedPaidEditModel\(\)\)/);
  assert.match(model,/resolveProductionZoeBuildBillingProfile\(FIRST_EDIT_MODEL, occurredAt\)/);
  assert.match(model,/model:\s*"gpt-6-luna"/);
  assert.match(model,/maxCombinedInputTokens\s*>\s*20_000/);
  assert.match(model,/maxOutputTokens\s*>\s*4_096/);
});
test("required mode retains canonical operation identity and ledger-backed executor",()=>{
  assert.match(edit,/const meteringOperationId = requiredMetering[\s\S]*?requireZoeAiBillingOperationId/);
  assert.match(edit,/const transport = requiredMetering[\s\S]*?createRequiredZoeBuildAssistantTransport/);
  assert.match(edit,/enforceSameOriginPost\(req\)/);
  assert.match(edit,/canEditWithAi/);
});
test("no live model has been approved from a test fixture or environment variable",()=>{
  assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES/);
  assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[^\n]*\[\][\s\S]*?Object\.freeze\(\[\]\)/);
  assert.doesNotMatch(model,/NODE_ENV|ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID|approved.*true/);
});
test("missing approval / oversized model policy / missing key fail closed",()=>{
  assert.match(testFile,/AI_BILLING_OPERATIONS_NOT_APPROVED/);
  assert.match(testFile,/20_001/);
  assert.match(testFile,/4_097/);
  assert.match(testFile,/AI_PAID_EDIT_PROVIDER_NOT_CONFIGURED/);
});
test("source collector only reads UI files; never env or secrets",()=>{
  assert.match(collector,/READ_ONLY=YES ENV=NO DB=NO PROVIDER=NO/);
  assert.ok(collector.includes('if "/api/" in relative'));
  assert.doesNotMatch(collector,/\.env\.local|DATABASE_URL|STRIPE_WEBHOOK_SECRET/);
});
