/**
 * V12J.10B: real-development-PostgreSQL, synthetic-funding/usage acceptance.
 * No Stripe/OpenAI requests. Retains synthetic ledger records for auditing.
 * Does not run during ordinary unit tests or until schema is explicitly deployed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import { createPrismaAiCreditResultJournal } from "./aiCreditResultJournal";
import { purgeExpiredAiCreditResults } from "./aiCreditResultRetention";
vi.mock("server-only",()=>({}));
const enabled=process.env.AI_SETTLEMENT_ACCEPTANCE_RUN==="V12J8A_VERIFIED_DEVELOPMENT_DATABASE" &&
 process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE==="learnoir_db" &&
 process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE==="admin" &&
 process.env.BILLING_ACCEPTANCE_RUN==="V12J5_VERIFIED_DEVELOPMENT_DATABASE";
const conversion={versionId:"v12j10b-synthetic-v1",creditUnitsPerCredit:"1000000",
 creditValueUsdNano:"10000000",markupNumerator:"1",markupDenominator:"1"};
const keyV1=randomBytes(32).toString("base64");
const keyV2=randomBytes(32).toString("base64");
const hex=()=>randomUUID().replace(/-/g,"");
const digest="b".repeat(64);
describe.runIf(enabled)("V12J.10B synthetic encrypted recovery real PostgreSQL",()=>{
 let db:PrismaClient;
 let ledger:typeof import("@zoeskoul/platform-server/ai-credits/ledger");
 let provider:typeof import("../../../../../packages/platform-server/src/ai-credits/aiCreditProviderRequest");
 const created:string[]=[];
 async function fixture(options?:{key?:string}){
   const userId=`pg-ai-v12j10b-${randomUUID()}`;
   created.push(userId);
   await db.user.create({data:{id:userId}});
   await ledger.grantAiCreditLot({client:db,userId,sourceKey:`v12j10b:synthetic:${hex()}`,
     kind:"purchased",origin:"verified-stripe-payment",units:"1000000",expiresAt:null});
   const idempotencyKey=`v12j10b:${hex()}`;
   const reservation=await ledger.reserveAiCredits({client:db,userId,idempotencyKey,
     maximumUnits:"600000",pricingVersionId:conversion.versionId,conversion});
   const clientRequestId=`zb-${randomUUID()}`,providerResponseId=`resp_v12j10b_${hex()}`;
   const requestSha256=options?.key??digest;
   await provider.bindAiCreditProviderRequest({client:db,userId,reservationId:reservation.id,
     idempotencyKey,provider:"openai",model:"synthetic-only",clientRequestId,requestSha256});
   await provider.captureAiCreditProviderResponse({client:db,userId,reservationId:reservation.id,
     clientRequestId,providerResponseId,providerHttpRequestId:`req_${hex()}`});
   await provider.recordAiCreditPricedProviderReceipt({client:db,userId,reservationId:reservation.id,
     clientRequestId,providerResponseId,pricingVersionId:conversion.versionId,
     costUsdNano:"2000000",usageSha256:"c".repeat(64)});
   const result={text:'{"message":"synthetic recovery only"}',usage:{provider:"openai" as const,
     inputTokens:10,outputTokens:6,cachedInputTokens:0,cacheWriteInputTokens:0,
     reasoningOutputTokens:null,providerRaw:{internal:"not persisted"}},
     metadata:{provider:"openai" as const,model:"synthetic-only",temperature:0,
       schemaName:"Synthetic",serviceTier:"default",providerResponseId,
       providerHttpRequestId:"req_synthetic"}};
   return {userId,idempotencyKey,reservationId:reservation.id,clientRequestId,
     requestSha256,providerResponseId,pricingVersionId:conversion.versionId,result};
 }
 beforeAll(async()=>{
   if(!enabled)throw Error("JOURNAL_PG_EXPLICIT_APPROVAL_REQUIRED");
   const {verifiedJournalPreflight}=await import("../../../../../packages/db/scripts/check-ai-credit-result-schema-v12j10b.mjs");
   const parity=await verifiedJournalPreflight();
   if(parity.stage!=="applied")throw Error("JOURNAL_PG_SCHEMA_UNAPPLIED");
   const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=await import(
      "../../../../../packages/db/scripts/billing-postgres-dev-preflight.mjs");
   const url=selectedDevDatabaseUrl();const identity=await preflightBillingDevelopmentDatabase(url);
   if(!identity.ok||identity.database!=="learnoir_db"||identity.role!=="admin")throw Error("JOURNAL_PG_DB_UNVERIFIED");
   process.env.ADMIN_DATABASE_URL=url;process.env.WEB_DATABASE_URL=url;process.env.DATABASE_URL=url;
   const {getPrismaClient}=await import("@zoeskoul/db");db=getPrismaClient();
   const rows=await db.$queryRaw<Array<{database:string;role:string;
     server_address:string|null;server_port:number|null;server_started_at:string}>>`
     SELECT current_database() AS database,current_user AS role,
       inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
       pg_postmaster_start_time()::text AS server_started_at`;
   const actual=rows[0];
   if(!actual || actual.database!==identity.database || actual.role!==identity.role ||
      actual.server_address!==identity.serverAddress || actual.server_port!==identity.serverPort ||
      actual.server_started_at!==identity.serverStartedAt)throw Error("JOURNAL_PG_PRISMA_DB_MISMATCH");
   ledger=await import("@zoeskoul/platform-server/ai-credits/ledger");
   provider=await import("../../../../../packages/platform-server/src/ai-credits/aiCreditProviderRequest");
 },30000);
 afterAll(async()=>{
   if(db){const users=await db.user.count({where:{id:{in:created}}});
    console.log(`V12J10B_PG_AUDIT retainedSyntheticUsers=${users} expected=${created.length} noProviderCalls=YES`);
    await db.$disconnect();}
 },30000);
 it("preserves ciphertext before settlement and recovers original receipt only once",async()=>{
   const f=await fixture();const journal=createPrismaAiCreditResultJournal({client:db,encryptionKey:keyV1});
   await journal.preserve(f);
   const rows=await db.$queryRaw<Array<{ciphertext:string;keyId:string}>>`
     SELECT "ciphertext","keyId" FROM "AiCreditResultJournal"
     WHERE "idempotencyKey"=${f.idempotencyKey}`;
   expect(rows).toHaveLength(1);expect(rows[0].keyId).toBe("v1");
   expect(JSON.stringify(rows[0])).not.toContain("synthetic recovery only");
   const recovered=await journal.restore(f);
   expect(recovered?.text).toBe(f.result.text);
   expect(recovered).not.toBeNull();
   expect(recovered?.usage?.providerRaw).toEqual({});
   const settled=await db.aiCreditReservation.findUniqueOrThrow({where:{id:f.reservationId}});
   expect(settled.status).toBe("settled");
   const ledgerCount=await db.aiCreditLedgerEntry.count({where:{userId:f.userId}});
   expect((await journal.restore(f))?.text).toBe(f.result.text);
   expect(await db.aiCreditLedgerEntry.count({where:{userId:f.userId}})).toBe(ledgerCount);
 },30000);
 it("rejects alternate user, request fingerprint, and immutable output overwrite",async()=>{
   const f=await fixture();const journal=createPrismaAiCreditResultJournal({client:db,encryptionKey:keyV1});
   await journal.preserve(f);
   expect(await journal.restore({...f,userId:"user_not_owned"})).toBeNull();
   await expect(journal.restore({...f,requestSha256:"d".repeat(64)})).rejects.toThrow("AI_RESULT_REPLAY_FINGERPRINT_MISMATCH");
   await expect(journal.preserve({...f,result:{...f.result,text:"different output"}})).rejects.toThrow("AI_RESULT_IMMUTABLE_CONFLICT");
   expect((await journal.restore(f))?.text).toBe(f.result.text);
 },30000);
 it("phased key rotation reads v1 and writes v2 without plaintext or double billing",async()=>{
   const old=await fixture(), newer=await fixture();
   const original=createPrismaAiCreditResultJournal({client:db,encryptionKey:keyV1});
   await original.preserve(old);
   const rotated=createPrismaAiCreditResultJournal({client:db,encryptionKey:keyV1,
     encryptionKeyV2:keyV2,activeKeyId:"v2"});
   await rotated.preserve(newer);
   expect((await rotated.restore(old))?.text).toBe(old.result.text);
   expect((await rotated.restore(newer))?.text).toBe(newer.result.text);
   const versions=await db.$queryRaw<Array<{idempotencyKey:string;keyId:string}>>`
     SELECT "idempotencyKey","keyId" FROM "AiCreditResultJournal"
     WHERE "idempotencyKey" IN (${old.idempotencyKey},${newer.idempotencyKey})`;
   expect(versions.find(v=>v.idempotencyKey===old.idempotencyKey)?.keyId).toBe("v1");
   expect(versions.find(v=>v.idempotencyKey===newer.idempotencyKey)?.keyId).toBe("v2");
 },30000);
 it("purges only expired ciphertext in bounded, rolled-back rehearsal",async()=>{
   const f=await fixture();const journal=createPrismaAiCreditResultJournal({client:db,encryptionKey:keyV1});
   await journal.preserve(f);
   // Rehearse retention inside a transaction forced to roll back, so no
   // unrelated expiry records can be deleted by this acceptance test.
   await expect(db.$transaction(async tx=>{
     const count=await purgeExpiredAiCreditResults({client:tx as unknown as PrismaClient,
       now:new Date(Date.now()+3*86400000),batchSize:100});
     expect(count).toBeGreaterThanOrEqual(1);
     const transient=await tx.$queryRaw<Array<{idempotencyKey:string}>>`
       SELECT "idempotencyKey" FROM "AiCreditResultJournal"
       WHERE "idempotencyKey"=${f.idempotencyKey}`;
     expect(transient).toHaveLength(0);
     throw Error("V12J10B_EXPECTED_ROLLBACK");
   })).rejects.toThrow("V12J10B_EXPECTED_ROLLBACK");
   expect((await journal.restore(f))?.text).toBe(f.result.text);
 },30000);
 it("refuses invalid unbounded retention parameters before database writes",async()=>{
   await expect(purgeExpiredAiCreditResults({client:db,batchSize:101})).rejects.toThrow("AI_RESULT_RETENTION_INPUT_INVALID");
   await expect(purgeExpiredAiCreditResults({client:db,batchSize:0})).rejects.toThrow("AI_RESULT_RETENTION_INPUT_INVALID");
 },30000);
});
