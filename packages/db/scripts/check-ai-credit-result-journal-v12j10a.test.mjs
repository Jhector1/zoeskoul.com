import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=rel=>readFileSync(new URL(rel,root),"utf8");
const executor=read("apps/zoebuild/src/lib/build/meteredAiJsonExecution.ts");
const store=read("apps/zoebuild/src/lib/build/aiCreditResultJournal.ts");
const crypto=read("apps/zoebuild/src/lib/build/aiCreditResultCrypto.ts");
const schema=read("packages/db/prisma/schema.prisma");
const sql=read("packages/db/prisma/migrations/20261023210000_v12j10a_ai_credit_result_journal/migration.sql");
const registry=read("apps/zoebuild/src/lib/build/verifiedAiCreditReservationPolicy.ts");
const ops=read("apps/zoebuild/src/lib/build/productionAiBillingReadiness.ts");
const planner=read("apps/zoebuild/src/lib/build/meteredZoeBuildPlanning.ts");
const assistant=read("apps/zoebuild/src/lib/build/serverOwnedZoeBuildMetering.ts");
test("single canonical financial source remains unchanged",()=>{
 for(const name of ["reserveAiCredits","bindAiCreditProviderRequest",
  "captureAiCreditProviderResponse","recordAiCreditPricedProviderReceipt","settleAiCredits"])
  assert.ok(executor.includes(name));
 assert.ok(store.includes("settleAiCreditsFromRecordedProviderReceipt"));
 assert.doesNotMatch(store,/grantAiCreditLot|releaseUnusedAiReservation|generateJsonText\(/);
});
test("provider output is encrypted before settlement; uncertain results never silently release",()=>{
 const receipt=executor.indexOf("await recordAiCreditPricedProviderReceipt(");
 const persist=executor.indexOf("await input.resultJournal.preserve(");
 const settle=executor.indexOf("await settleAiCredits(");
 assert.ok(receipt>=0 && receipt<persist && persist<settle);
 assert.match(executor,/AI_METERING_ALREADY_RESERVED/);
 assert.match(executor,/await input.resultJournal.restore\(/);
 assert.match(executor,/AI_METERING_REPLAY_REVIEW_REQUIRED/);
});
test("journal requires same owner, request fingerprint and provider captured receipt",()=>{
 for(const s of ["reservation.userId!==value.userId","reservation.idempotencyKey!==value.idempotencyKey",
  "provider.requestSha256!==value.requestSha256","provider.providerResponseId!==record.providerResponseId",
  "provider.receiptPricingVersionId!==record.pricingVersionId","provider.receiptRecordedAt",
  "final.status!==\"settled\""]) assert.ok(store.includes(s),s);
 assert.match(store,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
});
test("crypto uses AES 256 GCM with AAD, bounded plaintext, and no raw provider record",()=>{
 assert.match(crypto,/aes-256-gcm/);
 assert.match(crypto,/setAAD\(/);
 assert.match(crypto,/AI_RESULT_MAX_BYTES = 128 \* 1024/);
 assert.match(crypto,/providerRaw:\{\}/);
});
test("canonical schema and migration represent same result journal",()=>{
 for(const field of ["idempotencyKey","reservationId","userId","requestSha256",
  "providerResponseId","clientRequestId","pricingVersionId","keyId","nonce","tag",
  "ciphertext","contentSha256","expiresAt","createdAt"]){
  assert.ok(schema.includes(field),field);assert.ok(sql.includes('"'+field+'"'),field);
 }
 assert.match(schema,/model AiCreditResultJournal/);
 assert.match(sql,/FOREIGN KEY \("reservationId"\) REFERENCES "AiCreditReservation"/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|UPDATE "AiCreditReservation"|GRANT ALL/);
});
test("all required-mode composition paths create encrypted result journal",()=>{
 for(const s of [planner,assistant]) assert.match(s,/createPrismaAiCreditResultJournal\(/);
 assert.match(planner,/process.env.ZOEBUILD_AI_RESULT_KEY_V1/);
 assert.match(assistant,/process.env.ZOEBUILD_AI_RESULT_KEY_V1/);
});
test("pricing and operations approval remain EMPTY (production still blocked)",()=>{
 assert.match(registry,/ZOEBUILD_VERIFIED_AI_BILLING_PROFILES[^\n]*Object.freeze\(\[\]\)/);
 assert.match(ops,/ZOEBUILD_APPROVED_BILLING_OPERATIONS:[\s\S]*?Object.freeze\(\[\]\)/);
});
test("journal never writes financial quantities or accesses Stripe, provider, or browser storage",()=>{
 for(const source of [store,crypto]){
  assert.doesNotMatch(source,/aiCreditLot\.(?:update|create)|fetch\(|localStorage|sessionStorage|STRIPE_SECRET|OPENAI_API_KEY/);
 }
});
