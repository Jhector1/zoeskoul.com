import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=(file)=>readFileSync(new URL(file,root),"utf8");
const probe=read("apps/zoebuild/src/lib/build/realOpenAiUsageEvidence.ts");
const unit=read("apps/zoebuild/src/lib/build/realOpenAiUsageEvidence.test.ts");
const live=read("apps/zoebuild/src/lib/build/realOpenAiUsageEvidence.acceptance.test.ts");
const runner=read("packages/db/scripts/run-zoebuild-real-openai-usage-v12j11a.mjs");
const registry=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");

test("live provider acceptance requires separate exact operator consent",()=>{
 assert.match(runner,/V12J11A_SINGLE_REAL_REQUEST_APPROVED/);
 assert.match(probe,/REAL_PROVIDER_EXPLICIT_APPROVAL_REQUIRED/);
 assert.match(runner,/ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_MODEL/);
 assert.match(runner,/model!==reviewed/);
});
test("one provider count and one bounded generate call, without wallet code",()=>{
 assert.match(probe,/REAL_PROVIDER_INPUT_TOKEN_CAP = 512/);
 assert.match(probe,/REAL_PROVIDER_OUTPUT_TOKEN_CAP = 256/);
 assert.match(probe,/countInputTokens\(probeRequest\)/);
 assert.match(probe,/generateJsonText\(/);
 assert.match(live,/calls>2/);
 assert.match(live,/countCalls===1|countCalls\)\.toBe\(1\)/);
 assert.match(live,/responseCalls\)\.toBe\(1\)/);
 for(const f of [probe,live,runner])
  assert.doesNotMatch(f,/grantAiCreditLot|reserveAiCredits|settleAiCredits|stripe\.checkout|\.\$executeRaw|migrate deploy/);
});
test("provider evidence only from actual first-party JSON transport",()=>{
 assert.match(probe,/createOpenAiJsonTransport/);
 assert.match(probe,/REAL_PROVIDER_GLOBAL_ENDPOINT = "https:\/\/api\.openai\.com\/v1"/);
 assert.match(probe,/REAL_PROVIDER_STRUCTURED_OUTPUT_INVALID/);
 assert.match(live,/redirect:"error"/);
 assert.match(unit,/refuses non-first-party endpoints/);
});
test("no paid provider call from ordinary unit-suite runs",()=>{
 assert.match(live,/describe\.runIf\(enabled\)/);
 assert.match(runner,/ZOEBUILD_REAL_PROVIDER_ACCEPTANCE_RUN/);
 assert.match(runner,/--run/);
 assert.match(unit,/fakeTransport/);
});
test("usage evidence redacts output, bearer credentials and raw provider usage",()=>{
 assert.match(probe,/responseIdDigest/);
 assert.match(live,/Never print API keys/);
 assert.doesNotMatch(live,/console\.log\((?:result|request|transport)/);
 assert.doesNotMatch(runner,/console\.log\(env\.OPENAI_API_KEY/);
});
test("unapproved production model and operational pricing registries remain empty",()=>{
 assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*Object\.freeze\(\[\]\)/);
 assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[\s\S]*?Object\.freeze\(\[\]\)/);
});
