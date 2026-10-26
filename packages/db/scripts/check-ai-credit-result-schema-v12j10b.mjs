/** V12J.10B read-only migration/history/schema gate. Never deploys SQL. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const TARGET='20261023210000_v12j10a_ai_credit_result_journal';
export const REVIEWED_ROLLBACK='20260831203000_student_campaign_dont_show_again';
const sha=b=>createHash('sha256').update(b).digest('hex');
const isMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
export function localMigrationFiles(directory=join(root,'packages/db/prisma/migrations')) {
  if (!existsSync(directory)||lstatSync(directory).isSymbolicLink()) throw Error('JOURNAL_MIGRATION_DIR_UNSAFE');
  const files=[];
  for (const entry of readdirSync(directory,{withFileTypes:true})){
    if (!entry.isDirectory()) continue;
    if (!/^\d{14}_[a-zA-Z0-9_]+$/.test(entry.name)) throw Error('JOURNAL_MIGRATION_NAME_INVALID');
    const sql=join(directory,entry.name,'migration.sql');
    if (!existsSync(sql)||lstatSync(sql).isSymbolicLink()) throw Error('JOURNAL_MIGRATION_FILE_UNSAFE');
    files.push({name:entry.name,checksum:sha(readFileSync(sql))});
  }
  files.sort((a,b)=>a.name.localeCompare(b.name));
  // The journal migration need not remain the last migration forever. Newer
  // migrations are expected as the platform evolves. Reject a genuinely absent
  // journal without treating independently applied later migrations as drift.
  if (!files.some(x=>x.name===TARGET)) throw Error('JOURNAL_MIGRATION_NOT_FOUND');
  return files;
}
export function verifyMigrationHistory({local,history}) {
  if (!Array.isArray(local)||!Array.isArray(history)||
      !local.some(x=>x.name===TARGET))
    return {ok:false,reason:'INVALID_LOCAL_HISTORY'};
  const hashes=new Map(local.map(x=>[x.name,x.checksum]));
  if(hashes.size!==local.length)return {ok:false,reason:'DUPLICATE_LOCAL_NAME'};
  const done=new Set();let rolledBack=0;
  for(const row of history){
    if(!row||!hashes.has(row.name)||typeof row.checksum!=='string'||
       !/^[a-f0-9]{64}$/.test(row.checksum)||typeof row.finished!=='boolean'||
       typeof row.rolledBack!=='boolean')return {ok:false,reason:'UNKNOWN_HISTORY_ROW'};
    if(row.rolledBack){
      if(row.name!==REVIEWED_ROLLBACK||row.finished||++rolledBack>1)
        return {ok:false,reason:'UNREVIEWED_ROLLBACK'};
      continue;
    }
    if(!row.finished||done.has(row.name))return {ok:false,reason:'UNRESOLVED_OR_DUPLICATE_HISTORY'};
    if(row.checksum!==hashes.get(row.name))return {ok:false,reason:'CHECKSUM_DRIFT'};
    done.add(row.name);
  }
  if(rolledBack>0&&!done.has(REVIEWED_ROLLBACK))
    return {ok:false,reason:'ROLLED_BACK_WITHOUT_SUCCESS'};
  const missing=local.filter(x=>!done.has(x.name));
  if(missing.length===1&&missing[0].name===TARGET &&
     // A journal still pending cannot be skipped past later applied migrations.
     // Keep the narrow, existing migration-authorization flow for that case.
     !local.some(x=>x.name>TARGET))
    return {ok:true,stage:'pending',applied:done.size,pending:1};
  if(missing.length===0)return {ok:true,stage:'applied',applied:done.size,pending:0};
  return {ok:false,reason:'UNRELATED_PENDING_MIGRATION'};
}
export async function inspectJournalSchema(pool,identity, local=localMigrationFiles()) {
 const client=await pool.connect();
 try {
  await client.query('BEGIN READ ONLY');
  try {
    const {rows:[now]}=await client.query(`SELECT current_database() AS database,
      current_user AS db_role, current_setting('transaction_read_only') AS readonly,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`);
    if(!now||now.database!==identity.database||now.db_role!==identity.role||
       now.readonly!=='on'||now.server_address!==identity.serverAddress||
       now.server_port!==identity.serverPort||now.server_started_at!==identity.serverStartedAt)
      throw Error('JOURNAL_DATABASE_IDENTITY_CHANGED');
    const {rows}=await client.query(`SELECT migration_name AS name, checksum,
      finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack"
      FROM public."_prisma_migrations" ORDER BY started_at,migration_name`);
    const parity=verifyMigrationHistory({local,history:rows});
    if(!parity.ok)throw Error('JOURNAL_HISTORY_'+parity.reason);
    const {rows:[presence]}=await client.query(`SELECT to_regclass('public."AiCreditResultJournal"') IS NOT NULL AS present`);
    if(Boolean(presence?.present)!==(parity.stage==='applied'))
      throw Error('JOURNAL_SCHEMA_HISTORY_MISMATCH');
    if(parity.stage==='applied'){
      const {rows:cols}=await client.query(`SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='AiCreditResultJournal'`);
      const names=new Set(cols.map(x=>x.name));
      for(const name of ['idempotencyKey','reservationId','userId','requestSha256',
        'providerResponseId','clientRequestId','pricingVersionId','keyId','nonce',
        'tag','ciphertext','contentSha256','expiresAt','createdAt'])
        if(!names.has(name))throw Error('JOURNAL_SCHEMA_COLUMN_MISSING');
      const {rows:links}=await client.query(`SELECT c.conname AS name,c.contype AS type
        FROM pg_constraint c WHERE c.conrelid='public."AiCreditResultJournal"'::regclass`);
      if(!links.some(x=>x.type==='f'&&x.name==='AiCreditResultJournal_reservationId_fkey')||
         !links.some(x=>x.type==='p'))throw Error('JOURNAL_SCHEMA_CONSTRAINT_MISSING');
    }
    return parity;
  }finally{await client.query('ROLLBACK');}
 }finally{client.release();}
}
export async function verifiedJournalPreflight(){
 if(process.env.AI_SETTLEMENT_ACCEPTANCE_RUN!=='V12J8A_VERIFIED_DEVELOPMENT_DATABASE'||
    process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE!=='learnoir_db'||
    process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE!=='admin')
   throw Error('JOURNAL_EXPLICIT_DEV_APPROVAL_REQUIRED');
 process.env.BILLING_ACCEPTANCE_RUN='V12J5_VERIFIED_DEVELOPMENT_DATABASE';
 const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=await import('./billing-postgres-dev-preflight.mjs');
 const raw=selectedDevDatabaseUrl();
 const identity=await preflightBillingDevelopmentDatabase(raw);
 if(!raw||!identity.ok||identity.database!=='learnoir_db'||identity.role!=='admin')
   throw Error('JOURNAL_WRONG_DEVELOPMENT_TARGET');
 const {Pool}=await import('pg');const pool=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:7000,statement_timeout:15000});
 try {return await inspectJournalSchema(pool,identity);}finally{await pool.end();}
}
if(isMain){
 try{
   if(process.argv.length!==3||process.argv[2]!=='--inspect')throw Error('JOURNAL_USAGE_INSPECT_ONLY');
   const parity=await verifiedJournalPreflight();
   console.log(`V12J10B_JOURNAL_SCHEMA_${parity.stage.toUpperCase()} database=learnoir_db applied=${parity.applied} pending=${parity.pending} readOnly=YES`);
   if(parity.stage==='pending')console.log('NEXT=EXPLICIT_JOURNAL_MIGRATION_AUTHORIZATION_REQUIRED');
   else console.log('NEXT=RUN_JOURNAL_PG_ACCEPTANCE');
 }catch(e){console.error(`V12J10B_REFUSED reason=${e instanceof Error && /^[A-Z_]+$/.test(e.message)?e.message:'JOURNAL_REVIEW_REQUIRED'}`);process.exitCode=1;}
}
