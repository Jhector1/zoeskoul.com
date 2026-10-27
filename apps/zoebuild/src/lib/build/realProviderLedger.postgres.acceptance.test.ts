/** V12J.11B opt-in real provider + real DEVELOPMENT PostgreSQL settlement.
 * One actual paid Responses call maximum; isolated synthetic test credit funding.
 * Never enable customer billing or modify approved production pricing registries.
 * In case of unknown provider outcome NEVER automatically re-run this acceptance.
 */
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import type {PrismaClient} from "@zoeskoul/db";
import type {AiJsonRequest,AiPricingVersion} from "@zoeskoul/ai-json";
import {calculateAiTextTokenCeiling} from "@zoeskoul/ai-json";
import {providerNanoUsdToCreditUnits} from "@zoeskoul/platform-server/ai-credits/math";
import {executeMeteredAiJsonRequest} from "./meteredAiJsonExecution";
import {createPrismaAiCreditResultJournal} from "./aiCreditResultJournal";
import {aiCreditResultKeyring} from "./aiCreditResultCrypto";
import {makeRealOpenAiProviderTransport,REAL_PROVIDER_GLOBAL_ENDPOINT} from "./realOpenAiUsageEvidence";
import {ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS} from "./publishedModelPriceReviews";
vi.mock("server-only",()=>({}));

const APPROVAL="V12J11B_ONE_REAL_PROVIDER_LEDGER_ACCEPTANCE_APPROVED";
const enabled=process.env.ZOEBUILD_REAL_LEDGER_ACCEPTANCE_RUN===APPROVAL &&
 process.env.AI_SETTLEMENT_ACCEPTANCE_RUN==="V12J8A_VERIFIED_DEVELOPMENT_DATABASE" &&
 process.env.BILLING_ACCEPTANCE_RUN==="V12J5_VERIFIED_DEVELOPMENT_DATABASE" &&
 process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE==="learnoir_db" &&
 process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE==="admin";
const model="gpt-6.1-sol";
const now=()=>new Date();
const conversion={versionId:"v12j11b-synthetic-dev-credit-value",creditUnitsPerCredit:"1000000",
 creditValueUsdNano:"10000000",markupNumerator:"1",markupDenominator:"1"};
const CAP_INPUT=512,CAP_OUTPUT=256;
const request:AiJsonRequest={
 system:"Reply with only the small JSON object required by the schema. No explanations.",
 user:"Return ok true and probe zoebuild-v12j11b for the metered development acceptance.",
 schemaName:"ZoeBuildV12J11BLedgerProbe",
 responseJsonSchema:{type:"object",additionalProperties:false,
   properties:{ok:{type:"boolean",enum:[true]},probe:{type:"string",enum:["zoebuild-v12j11b"]}},
   required:["ok","probe"]},
 serviceTier:"default",maxOutputTokens:CAP_OUTPUT,
};

describe.runIf(enabled)("V12J.11B real provider -> canonical development ledger + encrypted result",()=>{
 let db:PrismaClient|undefined;
 const testUserId=`pg-ai-v12j11b-${randomUUID()}`;
 let countCalls=0,paidCalls=0;
 let accepted=false;
 let pricing:AiPricingVersion;
 let acceptedWriterId:"v1"|"v2"|"v3"|undefined;
 beforeAll(async()=>{
  if(process.env.NODE_ENV==="production" || process.env.ZOEBUILD_AI_CREDITS_ENFORCEMENT==="required" ||
    process.env.ZOEBUILD_AI_PROVIDER!=="openai" || process.env.ZOEBUILD_AI_MODEL!==model ||
    process.env.ZOEBUILD_REAL_LEDGER_ACCEPTANCE_MODEL!==model ||
    !process.env.OPENAI_API_KEY?.trim())throw Error("V12J11B_PROVIDER_OR_ENV_NOT_VERIFIED");
  // Use exactly the server-configured active result writer. The operator has
  // explicitly retired all historical disposable ciphertext before first-v1
  // setup. Never substitute an ephemeral test key or silently change key tags.
  const activeId=process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID;
  if(activeId!=="v1" && activeId!=="v2" && activeId!=="v3")
    throw Error("V12K11B_ACTIVE_WRITER_REQUIRED");
  acceptedWriterId=activeId;
  const keyring=aiCreditResultKeyring({
    v1:process.env.ZOEBUILD_AI_RESULT_KEY_V1,
    v2:process.env.ZOEBUILD_AI_RESULT_KEY_V2,
    v3:process.env.ZOEBUILD_AI_RESULT_KEY_V3,
    activeKeyId:process.env.ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID,
  });
  if(keyring.activeKeyId!==acceptedWriterId) throw Error("V12K11B_RESULT_WRITER_MISMATCH");
  const review=ZOEBUILD_PUBLISHED_STANDARD_PRICE_REVIEWS.find(r=>r.model===model);
  if(!review || review.processingTier!=="default" || review.region!=="global" ||
    now().getTime()-Date.parse(review.observedAt)>7*24*3600*1000 ||
    now().getTime()<Date.parse(review.observedAt) ||
    review.longContextStartsAboveInputTokens<CAP_INPUT || review.maximumModelOutputTokens<CAP_OUTPUT)
    throw Error("V12J11B_PUBLISHED_RATE_REVIEW_EXPIRED_OR_UNSUPPORTED");
  const pricingVersionId="v12j11b-dev-price-observation-20261019";
  pricing={id:pricingVersionId,provider:"openai",model,effectiveFrom:review.observedAt,
   currency:"USD",rates:Object.entries(review.rates).map(([category,usdPerMillionTokens])=>({
    category:category as AiPricingVersion["rates"][number]["category"],usdPerMillionTokens}))};
  const {verifiedJournalPreflight}=await import("../../../../../packages/db/scripts/check-ai-credit-result-schema-v12j10b.mjs");
  if((await verifiedJournalPreflight()).stage!=="applied")throw Error("V12J11B_JOURNAL_SCHEMA_NOT_VERIFIED");
  const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=await import(
   "../../../../../packages/db/scripts/billing-postgres-dev-preflight.mjs");
  const url=selectedDevDatabaseUrl();const identity=await preflightBillingDevelopmentDatabase(url);
  if(!identity.ok || identity.database!=="learnoir_db" || identity.role!=="admin")
    throw Error("V12J11B_DEV_DATABASE_NOT_VERIFIED");
  process.env.ADMIN_DATABASE_URL=url;process.env.WEB_DATABASE_URL=url;process.env.DATABASE_URL=url;
  const {getPrismaClient}=await import("@zoeskoul/db");db=getPrismaClient();
  const rows=await db.$queryRaw<Array<{database:string;role:string;server_address:string|null;
    server_port:number|null;server_started_at:string}>>`
    SELECT current_database() AS database,current_user AS role,
      inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`;
  const actual=rows[0];
  if(!actual||actual.database!==identity.database||actual.role!==identity.role||
     actual.server_address!==identity.serverAddress||actual.server_port!==identity.serverPort||
     actual.server_started_at!==identity.serverStartedAt)throw Error("V12J11B_PRISMA_DATABASE_MISMATCH");
  accepted=true;
 },30000);
 afterAll(async()=>{
  if(db){console.log("V12J11B_DEV_AUDIT "+JSON.stringify({
   userIdDigest:createHash("sha256").update(testUserId).digest("hex").slice(0,16),
   countCalls,paidCalls,retainedSyntheticFixture:true,customerCharges:false,
   productionPricingApproved:false,customerBillingActivated:false}));
   await db.$disconnect();}
 },30000);
 it("binds real response usage to one settled credit reservation and replays with zero extra generations",async()=>{
  if(!accepted||!db||!pricing||!acceptedWriterId)throw Error("V12J11B_PREFLIGHT_NOT_COMPLETED");
  // Test-only source key and isolated user. This is NOT an actual Stripe payment.
  await db.user.create({data:{id:testUserId}});
  // Synthetic wallet seed ONLY. Avoid calling grantAiCreditLot with a false
  // "verified-stripe-payment" assertion: there is no Stripe payment here.
  // This fixture exercises the canonical reservation/settlement paths without
  // fabricating a verified-funding event. It must never enter production routes.
  const syntheticSourceKey=`v12j11b:synthetic-only:${randomUUID()}`;
  await db.$transaction(async tx=>{
   await tx.aiCreditWallet.create({data:{userId:testUserId}});
   const lot=await tx.aiCreditLot.create({data:{
    userId:testUserId,sourceKey:syntheticSourceKey,kind:"purchased",
    grantedUnits:1000000n,availableUnits:1000000n,expiresAt:null,
   }});
   await tx.aiCreditLedgerEntry.create({data:{
    userId:testUserId,lotId:lot.id,
    eventKey:`grant:${syntheticSourceKey}`,kind:"grant",availableDelta:1000000n,
   }});
  });
  const ceiling=calculateAiTextTokenCeiling({provider:"openai",model,
   catalog:[pricing],occurredAt:now().toISOString(),
   maxCombinedInputTokens:CAP_INPUT,maxBillableOutputTokens:CAP_OUTPUT});
  const maximumUnits=providerNanoUsdToCreditUnits(ceiling.costUsdNano,conversion);
  if(maximumUnits<=0n||maximumUnits>1000000n)throw Error("V12J11B_TEST_RESERVATION_OUTSIDE_BUDGET");
  const transport=makeRealOpenAiProviderTransport({model,apiKey:process.env.OPENAI_API_KEY!,
   fetchImpl:async(url,options)=>{
     const endpoint=new URL(url);
     if(endpoint.origin!=="https://api.openai.com"||options?.method!=="POST"||!options?.body)
       throw Error("V12J11B_UNTRUSTED_PROVIDER_ENDPOINT");
     const body=JSON.parse(options.body) as Record<string,unknown>;
     if(body.model!==model||!Array.isArray(body.input)||body.input.length!==1||!body.text)
       throw Error("V12J11B_UNEXPECTED_PROVIDER_ENVELOPE");
     if(endpoint.pathname==="/v1/responses/input_tokens"){
       if(++countCalls>2||"max_output_tokens" in body||"service_tier" in body)
         throw Error("V12J11B_PROVIDER_COUNT_LIMIT");
     }else if(endpoint.pathname==="/v1/responses"){
       if(++paidCalls>1||body.max_output_tokens!==CAP_OUTPUT||
          body.service_tier!=="default"||body.store!==false||
          !options.headers?.["X-Client-Request-Id"])
         throw Error("V12J11B_PROVIDER_GENERATION_LIMIT");
     }else throw Error("V12J11B_UNKNOWN_PROVIDER_ENDPOINT");
     return fetch(url,{...options,signal:AbortSignal.timeout(45000),redirect:"error"});
   }});
  expect(transport.billingEndpointBaseUrl).toBe(REAL_PROVIDER_GLOBAL_ENDPOINT);
  const idempotencyKey=`v12j11b:${randomUUID()}`;
  const journal=createPrismaAiCreditResultJournal({
    client:db,
    encryptionKey:process.env.ZOEBUILD_AI_RESULT_KEY_V1,
    encryptionKeyV2:process.env.ZOEBUILD_AI_RESULT_KEY_V2,
    encryptionKeyV3:process.env.ZOEBUILD_AI_RESULT_KEY_V3,
    activeKeyId:acceptedWriterId,
  });
  const input={transport,request,client:db,userId:testUserId,idempotencyKey,
   pricingCatalog:[pricing],pricingVersionId:pricing.id,conversion,
   maximumUnits:maximumUnits.toString(),maxCombinedInputTokens:CAP_INPUT,
   maxBillableOutputTokens:CAP_OUTPUT,resultJournal:journal};
  let output;
  try {output=await executeMeteredAiJsonRequest(input);}
  catch(error){
   // Never expose provider response, secret, output or request body.
   // A failed dispatch may STILL have consumed provider funds; do not auto-retry.
   const name=error instanceof Error?error.name:"UnknownError";
   console.error(`V12J11B_REAL_LEDGER_PENDING kind=${name} countCalls=${countCalls} paidCalls=${paidCalls} NO_AUTO_RETRY=YES`);
   throw Error("V12J11B_REAL_LEDGER_REVIEW_REQUIRED");
  }
  const parsed=JSON.parse(output.text) as {ok?:boolean;probe?:string};
  expect(parsed).toEqual({ok:true,probe:"zoebuild-v12j11b"});
  expect(paidCalls).toBe(1);expect(countCalls).toBe(1);
  const reservation=await db.aiCreditReservation.findUniqueOrThrow({where:{idempotencyKey},include:{providerRequest:true}});
  expect(reservation.status).toBe("settled");
  expect(reservation.providerRequest?.receiptRecordedAt).not.toBeNull();
  expect(reservation.providerRequest?.providerResponseId).toBe(output.metadata.providerResponseId);
  expect(reservation.providerRequest?.receiptPricingVersionId).toBe(pricing.id);
  const journalRows=await db.$queryRaw<Array<{ciphertext:string;keyId:string}>>`
    SELECT "ciphertext","keyId" FROM "AiCreditResultJournal" WHERE "idempotencyKey"=${idempotencyKey}`;
  expect(journalRows).toHaveLength(1);
  expect(journalRows[0]!.keyId).toBe(acceptedWriterId);
  expect(journalRows[0]!.ciphertext).not.toContain("zoebuild-v12j11b");
  const balanceLedgerBefore=await db.aiCreditLedgerEntry.count({where:{userId:testUserId}});
  const resultAgain=await executeMeteredAiJsonRequest(input);
  expect(resultAgain.text).toBe(output.text);
  expect(resultAgain.metadata.providerResponseId).toBe(output.metadata.providerResponseId);
  expect(resultAgain.usage?.inputTokens).toBe(output.usage?.inputTokens);
  expect(resultAgain.usage?.outputTokens).toBe(output.usage?.outputTokens);
  expect(await db.aiCreditLedgerEntry.count({where:{userId:testUserId}})).toBe(balanceLedgerBefore);
  expect(paidCalls).toBe(1);expect(countCalls).toBe(2);
  console.log("V12J11B_REAL_PROVIDER_LEDGER_PASS "+JSON.stringify({
   model,usageInputTokens:output.usage?.inputTokens,usageOutputTokens:output.usage?.outputTokens,
   cachedInputTokens:output.usage?.cachedInputTokens,reasoningOutputTokens:output.usage?.reasoningOutputTokens,
   providerResponseIdDigest:createHash("sha256").update(output.metadata.providerResponseId??"").digest("hex").slice(0,16),
   providerCalls:paidCalls,tokenCountCalls:countCalls,creditReservationStatus:reservation.status,
   replayedWithoutSecondProviderCall:true,ledgerEntriesStable:true,encryptedResultStored:true,
   syntheticFundingOnly:true,productionBillingActivated:false}));
 },90000);
});
