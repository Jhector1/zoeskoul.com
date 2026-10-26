import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {JOURNAL_APPROVAL,requireJournalMigrationApproval,validateJournalStage}
 from "./apply-ai-credit-result-schema-v12j10c.mjs";
const env={AI_SETTLEMENT_ACCEPTANCE_RUN:"V12J8A_VERIFIED_DEVELOPMENT_DATABASE",
 BILLING_ACCEPTANCE_CONFIRMED_DATABASE:"learnoir_db",BILLING_ACCEPTANCE_CONFIRMED_ROLE:"admin"};
const pending={stage:"pending",applied:100,pending:1};
const applied={stage:"applied",applied:101,pending:0};
test("separate explicit journal authorization is required before migration",()=>{
 assert.throws(()=>requireJournalMigrationApproval("--apply",env),/NEW_SCHEMA_APPROVAL_REQUIRED/);
 assert.equal(JOURNAL_APPROVAL,"V12J10C_APPLY_JOURNAL_TO_LEARNOIR_DB_ONLY");
 requireJournalMigrationApproval("--apply",{...env,AI_JOURNAL_MIGRATION_APPROVAL:JOURNAL_APPROVAL});
});
test("database identity and role must match, even for read-only preflight",()=>{
 for(const patch of [{BILLING_ACCEPTANCE_CONFIRMED_DATABASE:"prod"},
   {BILLING_ACCEPTANCE_CONFIRMED_ROLE:"other"},{AI_SETTLEMENT_ACCEPTANCE_RUN:"none"}])
   assert.throws(()=>requireJournalMigrationApproval("--preflight",{...env,...patch}),/DEV_PREFLIGHT_REQUIRED/);
});
test("preflight and postflight have exact, distinct migration state",()=>{
 assert.deepEqual(validateJournalStage(pending,"--preflight"),pending);
 assert.deepEqual(validateJournalStage(applied,"--postflight"),applied);
 for(const [stage,mode] of [[pending,"--postflight"],[applied,"--preflight"],
  [{...pending,pending:2},"--preflight"],[{...applied,applied:0},"--postflight"]])
   assert.throws(()=>validateJournalStage(stage,mode),/UNEXPECTED_SCHEMA_STATE/);
});
test("invalid modes and unrelated approvals cannot execute the migration",()=>{
 assert.throws(()=>requireJournalMigrationApproval("--reset",env),/JOURNAL_MIGRATION_USAGE/);
 assert.throws(()=>requireJournalMigrationApproval("--apply",{
   ...env,AI_QUANTITY_MIGRATION_APPROVAL:"V12J8D_APPLY_TO_LEARNOIR_DB_ONLY"}),
   /NEW_SCHEMA_APPROVAL_REQUIRED/);
});
test("no direct SQL or Prisma history writes; only canonical Prisma deploy",()=>{
 const src=readFileSync(new URL("./apply-ai-credit-result-schema-v12j10c.mjs",import.meta.url),"utf8");
 assert.match(src,/verifiedJournalPreflight\(\)/);
 assert.match(src,/preflightBillingDevelopmentDatabase\(raw\)/);
 assert.match(src,/DIRECT_URL/);
 assert.match(src,/prisma","migrate","deploy"/);
 assert.doesNotMatch(src,/migrate reset|migrate resolve|\$executeRaw|DELETE FROM|ALTER TABLE|DROP TABLE/);
 assert.doesNotMatch(src,/console\.log\(child\.stdout|console\.error\(child\.stderr/);
});
test("JS preflight has a colocated exact .d.mts TypeScript contract",()=>{
 const d=readFileSync(new URL("./check-ai-credit-result-schema-v12j10b.d.mts",import.meta.url),"utf8");
 const js=readFileSync(new URL("./check-ai-credit-result-schema-v12j10b.mjs",import.meta.url),"utf8");
 assert.match(d,/export declare function verifiedJournalPreflight/);
 assert.match(js,/export async function verifiedJournalPreflight/);
 for(const part of ['"pending"','"applied"','applied: number','pending: number']) assert.ok(d.includes(part));
});
test("acceptance type repair retains strict result check and does not weaken gates",()=>{
 const src=readFileSync(new URL("../../../apps/zoebuild/src/lib/build/aiCreditResultJournal.postgres.acceptance.test.ts",import.meta.url),"utf8");
 assert.match(src,/expect\(recovered\)\.not\.toBeNull\(\)/);
 assert.match(src,/recovered\?\.usage\?\.providerRaw/);
 assert.match(src,/JOURNAL_PG_DB_UNVERIFIED/);
 assert.match(src,/verifiedJournalPreflight/);
 assert.match(src,/JOURNAL_PG_SCHEMA_UNAPPLIED/);
});
