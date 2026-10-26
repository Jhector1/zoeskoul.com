import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessAiCreditConstraintChange,readAiCreditConstraintChange,OLD_CHECK,NEW_CHECK,REFUND_CHECK} from './check-ai-credit-quantity-migration-v12j8c.mjs';
const migration=readFileSync(fileURLToPath(new URL('proposed-migrations/v12j8c_ai_credit_refund_quantity_conservation.sql',import.meta.url)),'utf8');
const expected={database:'learnoir_db',role:'admin',serverAddress:'127.0.0.1',serverPort:5432,serverStartedAt:'start'};
const con=(name,definition,validated=true)=>({name,definition,validated});
const rows=(stage='preflight')=>[con('AiCreditLot_quantities_check',stage==='preflight'?OLD_CHECK:NEW_CHECK),con('AiCreditLot_refund_reversal_nonnegative_chk',REFUND_CHECK)];
const invariants={totalLots:10,newConservationFailures:0,refundTargetFailures:0};
test('exact inspected OLD and expected NEW definitions differ only by reversed-unit conservation',()=>{
  assert.ok(!OLD_CHECK.includes('"reversedUnits"'));
  assert.ok(NEW_CHECK.includes('+ "reversedUnits"'));
  assert.ok(NEW_CHECK.includes('"reversedUnits" >= 0'));
  assert.equal(NEW_CHECK.replace(' AND "reversedUnits" >= 0','').replace(' + "reversedUnits"',''),OLD_CHECK);
});
test('migration is atomic and leaves historical reversal target constraint untouched',()=>{
  assert.match(migration,/^BEGIN;/m); assert.match(migration,/^COMMIT;/m);
  assert.match(migration,/actual_reversal IS DISTINCT FROM/);
  assert.doesNotMatch(migration,/DROP CONSTRAINT "AiCreditLot_refund_reversal_nonnegative_chk"/);
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public|DISABLE TRIGGER/i);
});
test('migration guards old exact live definition and existing rows before altering constraints',()=>{
  assert.ok(migration.includes(OLD_CHECK));
  assert.ok(migration.includes(REFUND_CHECK));
  assert.match(migration,/V12J8C_REFUSED_EXISTING_LOTS_VIOLATE_NEW_CONSERVATION/);
  assert.ok(migration.indexOf('actual_quantity IS DISTINCT FROM')<migration.indexOf('RENAME CONSTRAINT'));
});
test('migration validates replacement before removing old and retains stable constraint name',()=>{
  assert.match(migration,/ADD CONSTRAINT "AiCreditLot_quantities_check"[\s\S]*?NOT VALID/);
  assert.ok(migration.includes(NEW_CHECK));
  const rename=migration.indexOf('RENAME CONSTRAINT "AiCreditLot_quantities_check"');
  const add=migration.indexOf('ADD CONSTRAINT "AiCreditLot_quantities_check"');
  const validate=migration.indexOf('VALIDATE CONSTRAINT "AiCreditLot_quantities_check"');
  const drop=migration.indexOf('DROP CONSTRAINT "AiCreditLot_quantities_legacy_check"');
  assert.ok(rename>0 && rename<add && add<validate && validate<drop);
});
test('read-only preflight and postflight pass only their exact expected constraints',()=>{
  assert.equal(assessAiCreditConstraintChange({stage:'preflight',constraints:rows(),violations:invariants}).ok,true);
  assert.equal(assessAiCreditConstraintChange({stage:'postflight',constraints:rows('postflight'),violations:invariants}).ok,true);
  assert.equal(assessAiCreditConstraintChange({stage:'preflight',constraints:rows('postflight'),violations:invariants}).ok,false);
  assert.equal(assessAiCreditConstraintChange({stage:'postflight',constraints:rows(),violations:invariants}).ok,false);
});
test('extra, missing, unvalidated and changed refund constraints fail closed',()=>{
  const scenarios=[[],[...rows(),con('unexpected','CHECK (true)')],
    [rows()[0],con('AiCreditLot_refund_reversal_nonnegative_chk',REFUND_CHECK,false)],
    [rows()[0],con('AiCreditLot_refund_reversal_nonnegative_chk','CHECK (true)')],
    [...rows(),con('AiCreditLot_quantities_legacy_check',OLD_CHECK)]];
  for(const constraints of scenarios)assert.equal(assessAiCreditConstraintChange({stage:'preflight',constraints,violations:invariants}).ok,false);
});
test('any invariant violation blocks migration approval, including non-synthetic lots',()=>{
  for(const field of ['newConservationFailures','refundTargetFailures'])
    assert.equal(assessAiCreditConstraintChange({stage:'preflight',constraints:rows(),
      violations:{...invariants,[field]:1}}).ok,false);
});
test('read-only inspector checks server fingerprint and always rolls back',async()=>{
  const queries=[];
  const client={query:async(sql)=>{
    queries.push(sql);
    if(sql.startsWith('SELECT current_database()'))return {rows:[{database:expected.database,db_role:expected.role,
      readonly:'on',server_address:expected.serverAddress,server_port:expected.serverPort,server_started_at:expected.serverStartedAt}]};
    if(sql.includes('FROM pg_constraint'))return {rows:rows()};
    if(sql.includes('FROM public."AiCreditLot"'))return {rows:[invariants]};
    return {rows:[]};
  }};
  const read=await readAiCreditConstraintChange(client,expected);
  assert.equal(read.violations.totalLots,10);
  assert.equal(queries[0],'BEGIN READ ONLY'); assert.equal(queries.at(-1),'ROLLBACK');
  assert.equal(queries.filter(s=>s.includes('FROM public."AiCreditLot"')).length,1);
  assert.ok(queries.every(sql=>!/^\s*(?:UPDATE|DELETE|ALTER|DROP|INSERT)/i.test(sql)));
});
test('fingerprint mismatch refuses before inspecting financial data',async()=>{
  let queries=[];
  const client={query:async(sql)=>{
    queries.push(sql);
    return sql.startsWith('SELECT current_database()')?{rows:[{database:'not-the-approved-db'}]}:{rows:[]};
  }};
  await assert.rejects(readAiCreditConstraintChange(client,expected),/IDENTITY_MISMATCH/);
  assert.equal(queries.at(-1),'ROLLBACK');
  assert.equal(queries.some(x=>x.includes('FROM public."AiCreditLot"')),false);
});
test('proposal is not in Prisma auto-deploy directory and no script executes migrations',()=>{
  assert.match(fileURLToPath(new URL('proposed-migrations/v12j8c_ai_credit_refund_quantity_conservation.sql',import.meta.url)),/scripts\/proposed-migrations/);
  const inspector=readFileSync(fileURLToPath(new URL('./check-ai-credit-quantity-migration-v12j8c.mjs',import.meta.url)),'utf8');
  assert.doesNotMatch(inspector,/migrate deploy|prisma\.\$executeRaw|client\.query\(['"]ALTER/i);
});
