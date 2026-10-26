import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
import {localMigrationFiles,verifyMigrationHistory,TARGET,REVIEWED_ROLLBACK} from './check-ai-credit-result-schema-v12j10b.mjs';
const local=[{name:REVIEWED_ROLLBACK,checksum:'a'.repeat(64)},
 {name:'20261023180000_v12j8d_ai_credit_refund_quantity_conservation',checksum:'b'.repeat(64)},
 {name:TARGET,checksum:'c'.repeat(64)}];
const success=x=>({...x,finished:true,rolledBack:false});
const history=[success(local[0]),success(local[1]),
 {name:REVIEWED_ROLLBACK,checksum:'f'.repeat(64),finished:false,rolledBack:true}];
test('only new result journal pending is acceptable',()=>{
 assert.deepEqual(verifyMigrationHistory({local,history}),{ok:true,stage:'pending',applied:2,pending:1});
});
test('applied history accepted for postflight',()=>{
 assert.deepEqual(verifyMigrationHistory({local,history:[...history,success(local[2])]}),
 {ok:true,stage:'applied',applied:3,pending:0});
});
test('unresolved failure, checksum mismatch, unknown names and hidden pending block',()=>{
 const bad=[...history,{...success(local[0]),finished:false}];
 assert.equal(verifyMigrationHistory({local,history:bad}).ok,false);
 assert.equal(verifyMigrationHistory({local,history:[...history,{...success(local[2]),checksum:'f'.repeat(64)}]}).ok,false);
 assert.equal(verifyMigrationHistory({local,history:[...history,success({name:'20260101000000_unknown',checksum:'e'.repeat(64)})]}).ok,false);
 assert.equal(verifyMigrationHistory({local,history:[success(local[0])]}).ok,false);
});
test('historical rollback must be reviewed and followed by matching success',()=>{
 assert.equal(verifyMigrationHistory({local,history:history.filter(x=>x.name!==REVIEWED_ROLLBACK || x.rolledBack)}).ok,false);
 assert.equal(verifyMigrationHistory({local,history:[...history,{...history[2],name:TARGET}]}).ok,false);
});
test('read-only preflight and separate synthetic-fixture runner never deploy schema',()=>{
 const a=readFileSync(new URL('./check-ai-credit-result-schema-v12j10b.mjs',import.meta.url),'utf8');
 const b=readFileSync(new URL('./run-ai-credit-result-postgres-dev-acceptance-v12j10b.mjs',import.meta.url),'utf8');
 assert.match(a,/BEGIN READ ONLY/);assert.match(a,/ROLLBACK/);
 assert.match(b,/JOURNAL_SCHEMA_NOT_DEPLOYED/);
 for(const s of [a,b])assert.doesNotMatch(s,/migrate deploy|migrate resolve|migrate reset|DROP TABLE|ALTER TABLE/);
});

// V12J.23B: the repository continues to evolve after the journal migration.
// Preserve strict checksum/history equality but never require TARGET to be last
// once it is applied. This regression caught a pre-provider false refusal.
test('applied journal with newer completed migrations is accepted',()=>{
 const later={name:'20261024171500_followup_domain_migration',checksum:'d'.repeat(64)};
 const expanded=[...local,later];
 const complete=[...history,success(local[2]),success(later)];
 assert.deepEqual(verifyMigrationHistory({local:expanded,history:complete}),
  {ok:true,stage:'applied',applied:4,pending:0});
});
test('later pending migration, unknown history or checksum drift still refuse',()=>{
 const later={name:'20261024171500_followup_domain_migration',checksum:'d'.repeat(64)};
 const expanded=[...local,later];
 const journalDone=[...history,success(local[2])];
 assert.deepEqual(verifyMigrationHistory({local:expanded,history:journalDone}),
  {ok:false,reason:'UNRELATED_PENDING_MIGRATION'});
 assert.equal(verifyMigrationHistory({local:expanded,history:[...journalDone,success({...later,checksum:'e'.repeat(64)})]}).reason,'CHECKSUM_DRIFT');
 assert.equal(verifyMigrationHistory({local:expanded,history:[...journalDone,success({name:'20261025120000_unknown',checksum:'e'.repeat(64)})]}).reason,'UNKNOWN_HISTORY_ROW');
 // The journal cannot be marked pending if a later migration exists.
 assert.deepEqual(verifyMigrationHistory({local:expanded,history:[...history,success(later)]}),
  {ok:false,reason:'UNRELATED_PENDING_MIGRATION'});
});
test('journal target must exist, even if other migrations are valid',()=>{
 assert.deepEqual(verifyMigrationHistory({local:local.filter(x=>x.name!==TARGET),history:history.slice(0,2)}),
  {ok:false,reason:'INVALID_LOCAL_HISTORY'});
});
test('local migration scan accepts later directories, rejects absent journal',()=>{
 const root=mkdtempSync(join(tmpdir(),'v12j23b-migration-'));
 try {
  const names=[REVIEWED_ROLLBACK,TARGET,'20261024171500_followup_domain_migration'];
  for(const name of names){const path=join(root,name);mkdirSync(path);writeFileSync(join(path,'migration.sql'),`-- ${name}\n`);}
  const files=localMigrationFiles(root);
  assert.equal(files.length,3);
  assert.equal(files.at(-1).name,'20261024171500_followup_domain_migration');
  rmSync(join(root,TARGET),{recursive:true,force:true});
  assert.throws(()=>localMigrationFiles(root),/JOURNAL_MIGRATION_NOT_FOUND/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
