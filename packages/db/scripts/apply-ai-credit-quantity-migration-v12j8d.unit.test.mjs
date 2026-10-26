import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {MIGRATION_NAME,APPROVAL,assessHistory,readHistory,listLocalMigrations} from './apply-ai-credit-quantity-migration-v12j8d.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(here,'../../..');
const migration=readFileSync(resolve(repo,'packages/db/prisma/migrations',MIGRATION_NAME,'migration.sql'),'utf8');
const proposed=readFileSync(resolve(here,'proposed-migrations/v12j8c_ai_credit_refund_quantity_conservation.sql'),'utf8');
const noComments=s=>s.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').trim();
const local=[{name:'20261001120000_init',checksum:'a'.repeat(64)},
  {name:MIGRATION_NAME,checksum:'b'.repeat(64)}];
const row=(which=local[0])=>({name:which.name,checksum:which.checksum,finished:true,rolledBack:false});
test('canonical file SQL equals reviewed V12J.8C SQL excluding comments',()=>{
  assert.equal(noComments(migration),noComments(proposed));
  assert.match(migration,/BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration,/"reversedUnits"\)\) NOT VALID;/);
});
test('constraint replacement preserves separate refund target rule and stable name',()=>{
  assert.doesNotMatch(migration,/DROP CONSTRAINT "AiCreditLot_refund_reversal_nonnegative_chk"/);
  assert.match(migration,/RENAME CONSTRAINT "AiCreditLot_quantities_check"/);
  assert.match(migration,/VALIDATE CONSTRAINT "AiCreditLot_quantities_check"/);
  assert.match(migration,/REFUSED_EXISTING_LOTS_VIOLATE_NEW_CONSERVATION/);
});
test('history guard requires exactly one pending migration before deploy',()=>{
  assert.deepEqual(assessHistory({local,history:[row()],phase:'preflight'}),
    {ok:true,phase:'preflight',completed:1,pending:1});
  assert.equal(assessHistory({local,history:[],phase:'preflight'}).ok,false);
  assert.equal(assessHistory({local,history:local.map(row),phase:'preflight'}).ok,false);
});
test('history guard requires all migrations applied for postflight',()=>{
  assert.equal(assessHistory({local,history:local.map(row),phase:'postflight'}).ok,true);
  assert.equal(assessHistory({local,history:[row()],phase:'postflight'}).ok,false);
});
test('history rejects modified checksum, duplicate, and failed migration',()=>{
  const cases=[[{...row(),checksum:'bad'}],[row(),row()],
    [{...row(),finished:false}],[{...row(),rolledBack:true}]];
  for(const history of cases)assert.equal(assessHistory({local,history,phase:'preflight'}).ok,false);
});
test('history refuses hidden unapplied migrations and unknown applied names',()=>{
  assert.equal(assessHistory({local:[{name:'20250900000000_old',checksum:'a'.repeat(64)},...local],
    history:[row()],phase:'preflight'}).ok,false);
  assert.equal(assessHistory({local,history:[{...row(),name:'unknown'}],phase:'preflight'}).ok,false);
});
test('database audit queries are read only, transaction closed even on failure',async()=>{
  const calls=[];
  const client={query:async(sql)=>{calls.push(sql);if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('current_database'))return {rows:[{database:'learnoir_db',db_role:'admin',readonly:'on',server_address:'127.0.0.1',server_port:5432,server_started_at:'STAMP'}]};
    if(sql.includes('to_regclass'))return {rows:[{present:true}]};
    return {rows:[{name:local[0].name,checksum:local[0].checksum,finished:true,rolledBack:false}]};}};
  const result=await readHistory(client,{database:'learnoir_db',role:'admin',serverAddress:'127.0.0.1',serverPort:5432,serverStartedAt:'STAMP'});
  assert.equal(result.length,1);assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
  await assert.rejects(readHistory(client,{database:'prod',role:'admin'}));
  assert.equal(calls.at(-1),'ROLLBACK');
});
test('explicit environment and dev-only user approval needed for write phase',()=>{
  const src=readFileSync(new URL('./apply-ai-credit-quantity-migration-v12j8d.mjs',import.meta.url),'utf8');
  assert.match(src,/AI_QUANTITY_MIGRATION_APPROVAL/);
  assert.match(src,/BILLING_ACCEPTANCE_CONFIRMED_DATABASE/);
  assert.match(src,/BILLING_ACCEPTANCE_CONFIRMED_ROLE/);
  assert.equal(APPROVAL,'V12J8D_APPLY_TO_LEARNOIR_DB_ONLY');
  assert.match(src,/preflightBillingDevelopmentDatabase/);
  assert.match(src,/selectedDevDatabaseUrl/);
  assert.match(src,/DATABASE_URL:raw/);
});
test('no direct SQL application, only canonical Prisma deploy; no production runtime edits',()=>{
  const src=readFileSync(new URL('./apply-ai-credit-quantity-migration-v12j8d.mjs',import.meta.url),'utf8');
  assert.match(src,/spawnSync\('pnpm',\['exec','prisma','migrate','deploy'/);
  assert.doesNotMatch(src,/migrate resolve|\$executeRaw|query\(`?ALTER|CREATE TABLE|DELETE FROM/i);
  assert.doesNotMatch(src,/console\.log\(result\.stdout|console\.error\(result\.stderr/);
  assert.match(src,/NO_AUTORETRY/);
});
test('migration file is installable only as final migration after last existing',()=>{
  const dir=resolve(repo,'packages/db/prisma/migrations');
  try{
    const dirs=listLocalMigrations(dir);
    assert.equal(dirs.at(-1).name,MIGRATION_NAME);
  }catch(e){
    // local CI fixture repo may not have historical migrations; must refuse,
    // not automatically assume an empty history means safe deployment.
    assert.match(String(e),/V12J8D_/);
  }
});

// V12J.8F: narrow, reviewed historical migration attempt; no generic bypass.
const reviewedHistorical='20260831203000_student_campaign_dont_show_again';
const fullLocal=[
  {name:reviewedHistorical,checksum:'c'.repeat(64)},
  {name:'20261001120000_next',checksum:'d'.repeat(64)},
  {name:MIGRATION_NAME,checksum:'e'.repeat(64)},
];
const success=(entry)=>({name:entry.name,checksum:entry.checksum,finished:true,rolledBack:false});
const oldRollback=(patch={})=>({name:reviewedHistorical,checksum:'f'.repeat(64),finished:false,rolledBack:true,...patch});
const beforeTarget=[success(fullLocal[0]),success(fullLocal[1])];
test('reviewed historical rollback plus successful counterpart permits exactly one pending target',()=>{
  const evaluated=assessHistory({local:fullLocal,history:[oldRollback(),...beforeTarget],phase:'preflight'});
  assert.deepEqual(evaluated,{ok:true,phase:'preflight',completed:2,pending:1});
});
test('postflight recognizes the same reviewed rollback without counting it twice',()=>{
  const evaluated=assessHistory({local:fullLocal,history:[oldRollback(),...beforeTarget,success(fullLocal[2])],phase:'postflight'});
  assert.deepEqual(evaluated,{ok:true,phase:'postflight',completed:3,pending:0});
});
test('historical rollback WITHOUT successful matching migration stays blocked',()=>{
  const result=assessHistory({local:fullLocal,history:[oldRollback(),success(fullLocal[1])],phase:'preflight'});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'ROLLED_BACK_MIGRATION_WITHOUT_SUCCESSFUL_REPLACEMENT');
});
test('unreviewed, pending-target, malformed, or duplicate rollback attempts stay blocked',()=>{
  const bad=[
    [oldRollback({name:'20260901000000_different'})],
    [oldRollback({name:MIGRATION_NAME})],
    [oldRollback({finished:true})],
    [oldRollback({checksum:'invalid'})],
    [oldRollback(),oldRollback()],
    [oldRollback({name:'20261001120000_next'})],
  ];
  for(const additions of bad){
    const result=assessHistory({local:fullLocal,history:[...additions,...beforeTarget],phase:'preflight'});
    assert.equal(result.ok,false,JSON.stringify(additions));
  }
});
test('checksum drift on successfully applied historical migration remains blocked',()=>{
  const result=assessHistory({local:fullLocal,history:[oldRollback(),{...beforeTarget[0],checksum:'0'.repeat(64)},beforeTarget[1]],phase:'preflight'});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'APPLIED_MIGRATION_CHECKSUM_DRIFT');
});
test('duplicate success, unresolved failure, unknown history, and hidden pending predecessor still block',()=>{
  for(const additional of [
    [beforeTarget[0]],
    [{...beforeTarget[0],finished:false}],
    [{...beforeTarget[0],name:'20260101000000_unknown'}],
  ]){
    assert.equal(assessHistory({local:fullLocal,history:[oldRollback(),...beforeTarget,...additional],phase:'preflight'}).ok,false);
  }
  assert.equal(assessHistory({local:fullLocal,history:[oldRollback(),beforeTarget[0]],phase:'preflight'}).ok,false);
  assert.equal(assessHistory({local:fullLocal,history:[oldRollback(),...beforeTarget,success(fullLocal[2])],phase:'preflight'}).ok,false);
});
test('only named historical rollback is allowed; deploy guard, DB fingerprint, and canonical SQL are unchanged',()=>{
  const src=readFileSync(new URL('./apply-ai-credit-quantity-migration-v12j8d.mjs',import.meta.url),'utf8');
  assert.match(src,/20260831203000_student_campaign_dont_show_again/);
  assert.match(src,/readAiCreditConstraintChange\(client,identity\)/);
  assert.match(src,/preflightBillingDevelopmentDatabase\(raw\)/);
  assert.match(src,/AI_QUANTITY_MIGRATION_APPROVAL/);
  assert.match(src,/spawnSync\('pnpm',\['exec','prisma','migrate','deploy'/);
  assert.doesNotMatch(src,/prisma migrate resolve|migrate reset|UPDATE public\.\"_prisma_migrations\"|DELETE FROM public\.\"_prisma_migrations\"/);
});
