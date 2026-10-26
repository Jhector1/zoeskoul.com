import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=rel=>readFileSync(new URL(rel,root),"utf8");
const a=read("apps/zoebuild/src/lib/build/realProviderLedger.postgres.acceptance.test.ts");
const b=read("packages/db/scripts/run-zoebuild-real-provider-ledger-dev-v12j11b.mjs");
test("separate consent required and hard dev identity matches",()=>{
 for(const s of [a,b])for(const term of ["V12J11B_ONE_REAL_PROVIDER_LEDGER_ACCEPTANCE_APPROVED","learnoir_db","admin","gpt-6.1-sol"])
  assert.ok(s.includes(term),term);
 assert.match(b,/NODE_ENV!=="production"/);
 assert.match(b,/ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID==="v3"/);
});
test("actual paid provider call bounded to one and same request counted",()=>{
 assert.match(a,/\+\+paidCalls>1/);assert.match(a,/\+\+countCalls>2/);
 assert.match(a,/max_output_tokens!==CAP_OUTPUT/);
 assert.match(a,/redirect:"error"/);assert.match(a,/AbortSignal.timeout/);
});
test("tests do not alter canonical pricing or billing registry",()=>{
 const p=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
 const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
 assert.ok(p.includes("ZOEBUILD_VERIFIED_AI_BILLING_PROFILES: readonly ZoeBuildVerifiedAttemptPolicy[] = Object.freeze([])"));
 assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[\s\S]*?Object.freeze\(\[\]\)/);
 assert.doesNotMatch(a,/resolveProductionZoeBuildBillingProfile\(/);
});
test("real provider result uses canonical reserve, receipt, journal and settlement",()=>{
 assert.match(a,/executeMeteredAiJsonRequest\(input\)/);
 assert.match(a,/createPrismaAiCreditResultJournal/);
 assert.match(a,/aiCreditResultKeyring/);
 assert.match(a,/encryptionKeyV3:process.env.ZOEBUILD_AI_RESULT_KEY_V3/);
 assert.match(a,/journalRows\[0\]!\.keyId\)\.toBe\("v3"\)/);
 assert.match(a,/providerRequest\?\.receiptRecordedAt/);
 assert.match(a,/reservation.status\)\.toBe\("settled"\)/);
});
test("replay never adds ledger entries or sends second paid request",()=>{
 assert.match(a,/const balanceLedgerBefore/);
 assert.match(a,/const resultAgain=await executeMeteredAiJsonRequest\(input\)/);
 assert.match(a,/balanceLedgerBefore\)/);
 assert.match(a,/expect\(paidCalls\)\.toBe\(1\)/);
});
test("operator evidence redacts user, output, request, provider response id and key",()=>{
 assert.match(a,/providerResponseIdDigest/);
 assert.doesNotMatch(a,/console\.log\(output|console\.log\(testUserId|console\.log\(process\.env\.OPENAI_API_KEY/);
 assert.match(a,/NO_AUTO_RETRY=YES/);
});
test("test never runs migration or mutates Stripe",()=>{
 for(const src of [a,b])assert.doesNotMatch(src,/migrate deploy|migrate reset|stripe\.checkout|createPaymentIntent|STRIPE_SECRET_KEY/);
 assert.match(a,/verifiedJournalPreflight/);
 assert.match(a,/preflightBillingDevelopmentDatabase/);
});

test("one-shot guard is consumed before paid call and never auto-retries",()=>{
 assert.match(b,/openSync\(marker,"wx",0o600\)/);
 assert.match(b,/PRIOR_ATTEMPT_REVIEW_REQUIRED_NO_RETRY/);
 assert.match(b,/verifiedJournalPreflight/);
 assert.match(b,/PUBLISHED_PRICE_REVIEW_STALE/);
 assert.match(b,/paidProviderCallsMax=1/);
 assert.match(b,/NO_AUTO_RETRY=YES/);
 assert.doesNotMatch(b,/unlinkSync|rmSync|retry\(/);
});
test("V3 private secret cannot be logged and acceptance never enables billing",()=>{
 assert.doesNotMatch(a,/randomBytes\(32\)/);
 assert.doesNotMatch(a,/console\.log\(process\.env\.ZOEBUILD_AI_RESULT_KEY_V3/);
 assert.doesNotMatch(b,/console\.log\(k\)/);
 assert.doesNotMatch(b,/ZOEBUILD_AI_CREDITS_ENFORCEMENT=required/);
});
