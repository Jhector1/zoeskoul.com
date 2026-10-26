/** V12J.10C: independently approved, DEVELOPMENT ONLY journal migration runner.
 * Read-only pre/postflights work now. --apply requires separate explicit
 * approval for THIS new migration, not a previously approved billing migration.
 * No Stripe, provider, UI, Git, or AI-credit activation actions.
 */
import { existsSync, lstatSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifiedJournalPreflight, TARGET } from "./check-ai-credit-result-schema-v12j10b.mjs";

export const JOURNAL_APPROVAL="V12J10C_APPLY_JOURNAL_TO_LEARNOIR_DB_ONLY";
const EXPECTED_DB="learnoir_db",EXPECTED_ROLE="admin";
const repo=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const isMain=Boolean(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url));

export function requireJournalMigrationApproval(mode,env=process.env){
 if(!["--preflight","--postflight","--apply"].includes(mode))
   throw Error("JOURNAL_MIGRATION_USAGE");
 if(env.AI_SETTLEMENT_ACCEPTANCE_RUN!=="V12J8A_VERIFIED_DEVELOPMENT_DATABASE"||
    env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE!==EXPECTED_DB||
    env.BILLING_ACCEPTANCE_CONFIRMED_ROLE!==EXPECTED_ROLE)
   throw Error("JOURNAL_MIGRATION_DEV_PREFLIGHT_REQUIRED");
 if(mode==="--apply"&&env.AI_JOURNAL_MIGRATION_APPROVAL!==JOURNAL_APPROVAL)
   throw Error("JOURNAL_MIGRATION_NEW_SCHEMA_APPROVAL_REQUIRED");
}

export function validateJournalStage(parity,mode){
 const expected=mode==="--postflight"?"applied":"pending";
 if(!parity||parity.stage!==expected||parity.pending!==(expected==="pending"?1:0)||
    !Number.isSafeInteger(parity.applied)||parity.applied<1)
   throw Error("JOURNAL_MIGRATION_UNEXPECTED_SCHEMA_STATE");
 return parity;
}

async function main(mode){
 requireJournalMigrationApproval(mode);
 const parity=validateJournalStage(await verifiedJournalPreflight(),mode);
 console.log(`V12J10C_${mode==="--postflight"?"POSTFLIGHT":"PREFLIGHT"}_PASS `+
   `database=${EXPECTED_DB} applied=${parity.applied} pending=${parity.pending} readOnly=YES`);
 if(mode!=="--apply")return;
 // Import only after approval and read-only history/constraint parity checks.
 process.env.BILLING_ACCEPTANCE_RUN="V12J5_VERIFIED_DEVELOPMENT_DATABASE";
 const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=
   await import("./billing-postgres-dev-preflight.mjs");
 const raw=selectedDevDatabaseUrl();
 const identity=await preflightBillingDevelopmentDatabase(raw);
 if(!raw||!identity.ok||identity.database!==EXPECTED_DB||identity.role!==EXPECTED_ROLE)
   throw Error("JOURNAL_MIGRATION_WRONG_DATABASE");
 if(process.env.DIRECT_URL&&process.env.DIRECT_URL!==raw)
   throw Error("JOURNAL_MIGRATION_UNVERIFIED_DIRECT_URL");
 const cwd=join(repo,"packages/db");
 const config=join(cwd,"prisma.config.ts");
 const migration=join(cwd,"prisma/migrations",TARGET,"migration.sql");
 if(!existsSync(config)||!existsSync(migration)||lstatSync(migration).isSymbolicLink())
   throw Error("JOURNAL_MIGRATION_CONFIG_OR_SQL_MISSING");
 console.log("V12J10C_PRISMA_DEPLOY approvedDatabase=learnoir_db pending=1");
 const child=spawnSync("pnpm",["exec","prisma","migrate","deploy","--config","prisma.config.ts"],{
   cwd,env:{...process.env,DATABASE_URL:raw},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,
 });
 // Error output may contain URLs / credentials; do not print it here.
 if(child.error||child.status!==0)
   throw Error("JOURNAL_MIGRATION_PRISMA_DEPLOY_FAILED_NO_AUTO_RETRY");
 const after=await verifiedJournalPreflight();
 if(after.stage!=="applied"||after.pending!==0||after.applied!==parity.applied+1)
   throw Error("JOURNAL_MIGRATION_POSTFLIGHT_REVIEW_REQUIRED");
 console.log(`V12J10C_APPLY_AND_POSTFLIGHT_PASS database=${EXPECTED_DB} `+
   `applied=${after.applied} pending=0`);
 console.log("NEXT=RUN_V12J10B_REAL_POSTGRES_RECOVERY_ACCEPTANCE");
}
if(isMain){
 try{
   if(process.argv.length!==3)throw Error("JOURNAL_MIGRATION_USAGE");
   await main(process.argv[2]);
 }catch(error){
   const msg=error instanceof Error?error.message:"";
   console.error("V12J10C_REFUSED reason="+
     (/^JOURNAL_MIGRATION_[A-Z_]+$/.test(msg)?msg:"JOURNAL_MIGRATION_REVIEW_REQUIRED"));
   process.exitCode=1;
 }
}
