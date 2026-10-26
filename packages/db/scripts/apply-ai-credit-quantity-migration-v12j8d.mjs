/**
 * V12J.8D: verified-development-only canonical Prisma migration runner.
 * Does NOT modify production business logic, Stripe, providers or Git.
 * --preflight / --postflight are read-only; --apply uses Prisma migrate deploy
 * after exact database, history, checksum and schema checks.
 */
import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  assessAiCreditConstraintChange,
  readAiCreditConstraintChange,
} from './check-ai-credit-quantity-migration-v12j8c.mjs';

export const MIGRATION_NAME = '20261023180000_v12j8d_ai_credit_refund_quantity_conservation';
export const APPROVAL = 'V12J8D_APPLY_TO_LEARNOIR_DB_ONLY';
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../../..');
const migrations=join(repo,'packages/db/prisma/migrations');
const migrationFile=join(migrations,MIGRATION_NAME,'migration.sql');
const proposedFile=join(here,'proposed-migrations/v12j8c_ai_credit_refund_quantity_conservation.sql');
const expectedName='learnoir_db';
const expectedRole='admin';
const hash=(content)=>createHash('sha256').update(content).digest('hex');
const isMain=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);

export function listLocalMigrations(directory=migrations) {
  if(!existsSync(directory)||lstatSync(directory).isSymbolicLink())throw Error('V12J8D_MIGRATION_DIR_MISSING_OR_SYMLINK');
  const entries=readdirSync(directory,{withFileTypes:true});
  const dirs=entries.filter(e=>e.isDirectory()).map(e=>e.name).sort();
  if(dirs.length===0||!dirs.includes(MIGRATION_NAME)||dirs.at(-1)!==MIGRATION_NAME)
    throw Error('V12J8D_NEWER_OR_MISSING_MIGRATION_REFUSED');
  const rows=[];
  for(const name of dirs){
    if(!/^\d{14}_[a-zA-Z0-9_]+$/.test(name))throw Error('V12J8D_UNEXPECTED_MIGRATION_NAME');
    const file=join(directory,name,'migration.sql');
    if(!existsSync(file)||lstatSync(file).isSymbolicLink()||!lstatSync(file).isFile())
      throw Error('V12J8D_MISSING_OR_UNSAFE_MIGRATION_SQL');
    rows.push({name,checksum:hash(readFileSync(file))});
  }
  if(existsSync(join(directory,'migration_lock.toml')) &&
     !/provider\s*=\s*["']postgresql["']/.test(readFileSync(join(directory,'migration_lock.toml'),'utf8')))
    throw Error('V12J8D_NOT_POSTGRESQL_MIGRATION_PROVIDER');
  if(!existsSync(proposedFile) || !existsSync(migrationFile))
    throw Error('V12J8D_REVIEWED_MIGRATION_MISSING');
  const original=readFileSync(proposedFile,'utf8');
  const canonical=readFileSync(migrationFile,'utf8');
  const stripComments=s=>s.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').trim();
  if(stripComments(original)!==stripComments(canonical))
    throw Error('V12J8D_REVIEWED_SQL_DRIFT');
  return rows;
}

export function assessHistory({local,history,phase}) {
  if(!['preflight','postflight'].includes(phase))return {ok:false,reason:'INVALID_PHASE'};
  if(!Array.isArray(local)||!Array.isArray(history)||local.length<2||local.at(-1)?.name!==MIGRATION_NAME)
    return {ok:false,reason:'INVALID_MIGRATION_SET'};
  const expected=new Map(local.map(row=>[row.name,row.checksum]));
  if(expected.size!==local.length)return {ok:false,reason:'DUPLICATE_LOCAL_MIGRATIONS'};
  const applied=new Set();
  // V12J.8F: Prisma keeps an immutable row for a rolled-back migration attempt.
  // This ONE reviewed historical attempt is harmless only when the SAME named
  // migration has exactly one successfully completed row whose checksum matches
  // the canonical local file. Every other rolled-back/failed entry remains a
  // deployment blocker. Do not modify or delete Prisma migration history.
  const reviewedRollbackName='20260831203000_student_campaign_dont_show_again';
  const rolledBack=[];
  for(const row of history) {
    if(!row || typeof row.name!=='string' || !expected.has(row.name) ||
       typeof row.checksum!=='string' || !/^[a-f0-9]{64}$/.test(row.checksum) ||
       typeof row.finished!=='boolean' || typeof row.rolledBack!=='boolean')
      return {ok:false,reason:'UNEXPECTED_FAILED_OR_UNKNOWN_MIGRATION_HISTORY'};
    if(row.rolledBack) {
      // The rolled-back attempt must be unfinished and must refer to the one
      // specifically reviewed historical migration, never the pending target.
      if(row.finished || row.name!==reviewedRollbackName || row.name===MIGRATION_NAME ||
         rolledBack.length!==0)
        return {ok:false,reason:'UNREVIEWED_ROLLED_BACK_MIGRATION_HISTORY'};
      rolledBack.push(row);
      continue;
    }
    if(!row.finished || applied.has(row.name))
      return {ok:false,reason:'UNEXPECTED_FAILED_OR_UNKNOWN_MIGRATION_HISTORY'};
    if(row.checksum!==expected.get(row.name))
      return {ok:false,reason:'APPLIED_MIGRATION_CHECKSUM_DRIFT'};
    applied.add(row.name);
  }
  if(rolledBack.length!==0 && !applied.has(reviewedRollbackName))
    return {ok:false,reason:'ROLLED_BACK_MIGRATION_WITHOUT_SUCCESSFUL_REPLACEMENT'};
  const required=phase==='preflight'?local.slice(0,-1):local;
  if(applied.size!==required.length)return {ok:false,reason:'UNRELATED_PENDING_OR_MISSING_MIGRATIONS'};
  if(required.some(row=>!applied.has(row.name)))
    return {ok:false,reason:'UNRELATED_PENDING_OR_MISSING_MIGRATIONS'};
  return {ok:true, phase, completed:applied.size, pending:local.length-applied.size};
}

export async function readHistory(client, identity) {
  await client.query('BEGIN READ ONLY');
  try {
    const {rows:[now]}=await client.query(`SELECT current_database() AS database,
      current_user AS db_role, current_setting('transaction_read_only') AS readonly,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      pg_postmaster_start_time()::text AS server_started_at`);
    if(!now||now.database!==identity.database||now.db_role!==identity.role||now.readonly!=='on'||
       now.server_address!==identity.serverAddress||now.server_port!==identity.serverPort||
       now.server_started_at!==identity.serverStartedAt)
      throw Error('V12J8D_HISTORY_DATABASE_IDENTITY_MISMATCH');
    const {rows:[exists]}=await client.query(`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS present`);
    if(exists?.present!==true)throw Error('V12J8D_PRISMA_HISTORY_MISSING');
    const {rows}=await client.query(`SELECT migration_name AS name, checksum,
       finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack"
       FROM public."_prisma_migrations" ORDER BY started_at, migration_name`);
    return rows;
  }finally{await client.query('ROLLBACK');}
}

function ensureApproval(mode) {
  if(!['--preflight','--postflight','--apply'].includes(mode))throw Error('V12J8D_USAGE');
  if(process.env.AI_SETTLEMENT_ACCEPTANCE_RUN!=='V12J8A_VERIFIED_DEVELOPMENT_DATABASE' ||
     process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE!==expectedName ||
     process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE!==expectedRole)
    throw Error('V12J8D_DEVELOPMENT_IDENTITY_APPROVAL_REQUIRED');
  if(mode==='--apply'&&process.env.AI_QUANTITY_MIGRATION_APPROVAL!==APPROVAL)
    throw Error('V12J8D_SCHEMA_CHANGE_APPROVAL_REQUIRED');
}

async function readState(pool,identity,stage) {
  const client=await pool.connect();
  try {
    const constraints=await readAiCreditConstraintChange(client,identity);
    const checked=assessAiCreditConstraintChange({...constraints,stage});
    if(!checked.ok)throw Error(`V12J8D_CONSTRAINT_${checked.reason}`);
    const local=listLocalMigrations();
    const history=await readHistory(client,identity);
    const parity=assessHistory({local,history,phase:stage});
    if(!parity.ok)throw Error(`V12J8D_HISTORY_${parity.reason}`);
    return {checked,parity};
  }finally{client.release();}
}

async function run(){
  let pool;
  try{
    if(process.argv.length!==3)throw Error('V12J8D_USAGE');
    const mode=process.argv[2];ensureApproval(mode);
    process.env.BILLING_ACCEPTANCE_RUN='V12J5_VERIFIED_DEVELOPMENT_DATABASE';
    const {preflightBillingDevelopmentDatabase,selectedDevDatabaseUrl}=
      await import('./billing-postgres-dev-preflight.mjs');
    const raw=selectedDevDatabaseUrl();
    const identity=await preflightBillingDevelopmentDatabase(raw);
    if(!raw||!identity?.ok||identity.database!==expectedName||identity.role!==expectedRole)
      throw Error('V12J8D_DATABASE_PREFLIGHT_REFUSED');
    // Prisma must use the exact same verified URL. Disallow any alternate
    // unverified DIRECT_URL that could redirect migrations to another DB.
    if(process.env.DIRECT_URL && process.env.DIRECT_URL!==raw)
      throw Error('V12J8D_DIFFERENT_DIRECT_URL_REFUSED');
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:7000,
      idleTimeoutMillis:1000,statement_timeout:15000});
    const stage=mode==='--postflight'?'postflight':'preflight';
    const before=await readState(pool,identity,stage);
    console.log(`V12J8D_${stage.toUpperCase()}_PASS database=${expectedName} role=${expectedRole} `+
      `lots=${before.checked.totalLots} applied=${before.parity.completed} pending=${before.parity.pending} `+
      'reads=ONLY');
    if(mode!=='--apply')return;
    const cwd=join(repo,'packages/db');
    if(!existsSync(join(cwd,'prisma.config.ts')))
      throw Error('V12J8D_PRISMA_CONFIG_REVIEW_REQUIRED');
    console.log('V12J8D_APPLY_PRISMA_DEPLOY approvedDatabase=learnoir_db pending=1');
    const result=spawnSync('pnpm',['exec','prisma','migrate','deploy','--config','prisma.config.ts'],{
      cwd,env:{...process.env,DATABASE_URL:raw},encoding:'utf8',timeout:180000,maxBuffer:1024*1024*4});
    // Never echo Prisma raw output: database credentials, URLs, and PII are
    // potentially present in provider/config error strings.
    if(result.error||result.status!==0)
      throw Error('V12J8D_PRISMA_DEPLOY_FAILED_INSPECT_LOCALLY_NO_AUTORETRY');
    const after=await readState(pool,identity,'postflight');
    console.log(`V12J8D_APPLY_AND_POSTFLIGHT_PASS database=learnoir_db lots=${after.checked.totalLots} `+
      `applied=${after.parity.completed} pending=0`);
    console.log('NEXT=RUN_V12J8A_NINE_SCENARIO_POSTGRES_ACCEPTANCE');
  }catch(error){
    const reason=error instanceof Error&&/^V12J8D_[A-Z_]+$/.test(error.message)
      ?error.message:'V12J8D_UNEXPECTED_FAILURE_INSPECT_LOCALLY';
    console.error(`V12J8D_REFUSED reason=${reason}`);
    process.exitCode=1;
  }finally{if(pool)await pool.end();}
}
if(isMain)await run();
