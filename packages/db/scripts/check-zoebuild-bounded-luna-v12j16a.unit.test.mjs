import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync("apps/zoebuild/src/lib/build/boundedLunaEditReviewV12J16.ts", "utf8");
const registry = fs.readFileSync("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts", "utf8");
const operations = fs.readFileSync("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts", "utf8");
const route = fs.readFileSync("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", "utf8");
const collector=fs.readFileSync("packages/db/scripts/collect-zoebuild-metered-edit-v12j16a.py","utf8");
test("candidate is nonspending and not in either production registry",()=>{
 assert.match(source,/authorizedForSpending: false as const/);
 assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*= Object\.freeze\(\[\]\)/);
 assert.match(operations,/Object\.freeze\(\[\]\)/);
});
test("candidate uses independent published-price validator and conservative reservation policy",()=>{
 assert.match(source,/assertPublishedZoeBuildStandardPrice/);
 assert.match(source,/deriveZoeBuildAttemptReservation/);
 assert.match(source,/maxCombinedInputTokens: 20_000/);
 assert.match(source,/maxOutputTokens: 4_096/);
});
test("no test-only entitlement, migration, customer credit or provider activation",()=>{
 assert.doesNotMatch(source,/process\.env|NODE_ENV|grantAiCreditLot|reserveAiCredits|fetch\(/);
 assert.match(route,/createRequiredZoeBuildAssistantTransport/);
 assert.match(route,/requireZoeAiBillingOperationId/);
});
test("scoped collector does not inspect environment, DB or payment secrets",()=>{
 assert.match(collector,/READ_ONLY=YES/);
 assert.doesNotMatch(collector,/\.env\.shared|DATABASE_URL|OPENAI_API_KEY|STRIPE_WEBHOOK_SECRET/);
});
