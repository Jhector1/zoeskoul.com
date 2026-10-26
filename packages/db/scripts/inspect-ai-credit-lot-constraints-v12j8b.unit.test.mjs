import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessQuantityConstraint,readConstraintEvidence} from './inspect-ai-credit-lot-constraints-v12j8b.mjs';

const schema={name:'AiCreditLot_quantities_check',validated:true,
  definition:'CHECK ((("availableUnits" + "reservedUnits") + "consumedUnits" + "expiredUnits") = "grantedUnits")'};
test('reports actual PG check expression rather than assuming refund accounting is correct',()=>{
  const v=assessQuantityConstraint([schema]);
  assert.equal(v.status,'CONSTRAINT_FOUND');
  assert.equal(v.validated,true);
  assert.equal(v.referencesReversedUnits,false);
  assert.match(v.definition,/grantedUnits/);
});
test('includes reversal columns only if genuinely mentioned by the SQL',()=>{
  const v=assessQuantityConstraint([{...schema,definition:schema.definition+
    ' AND "reversedUnits" >= 0 AND "reversalTargetUnits" >= "reversalShortfallUnits"'}]);
  assert.equal(v.referencesReversedUnits,true);
  assert.equal(v.referencesReversalTarget,true);
  assert.equal(v.referencesShortfall,true);
});
test('requires one exact named constraint',()=>{
  assert.equal(assessQuantityConstraint([]).status,'CONSTRAINT_MISSING_OR_AMBIGUOUS');
  assert.equal(assessQuantityConstraint([schema,schema]).status,'CONSTRAINT_MISSING_OR_AMBIGUOUS');
});
const confirmed={database:'learnoir_db',role:'admin',serverAddress:'127.0.0.1',serverPort:5432,serverStartedAt:'today'};
function fakeClient(opts={}) {
  const queries=[];
  return {queries,async query(sql){queries.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.includes('current_database()'))return {rows:[{database:confirmed.database,db_role:confirmed.role,
      readonly:'on',server_address:confirmed.serverAddress,server_port:confirmed.serverPort,
      server_started_at:confirmed.serverStartedAt,...opts}]};
    if(sql.includes('FROM pg_constraint'))return {rows:[schema]};
    if(sql.includes('FROM public."AiCreditLot"'))return {rows:[{lots:10,conservation_failures:0,reversal_target_failures:0,reversed_lots:0}]};
    throw Error('UNEXPECTED_QUERY');
  }};
}
test('read-only inspection restricts reads to aggregate synthetic lots and constraint metadata',async()=>{
  const db=fakeClient();
  const evidence=await readConstraintEvidence(db,confirmed);
  assert.equal(evidence.constraintCount,1);
  assert.equal(evidence.synthetic.lots,10);
  assert.equal(db.queries[0],'BEGIN READ ONLY');
  assert.equal(db.queries.at(-1),'ROLLBACK');
  assert.ok(db.queries.some(x=>x.includes("WHERE \"userId\" LIKE 'pg-ai-v12j8a-%'")));
  for(const sql of db.queries)assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|COMMIT)\b/i);
});
test('unexpected DB identity fails closed and rolls back before reading any lot',async()=>{
  const db=fakeClient({database:'not-approved'});
  await assert.rejects(readConstraintEvidence(db,confirmed),/DATABASE_IDENTITY_MISMATCH/);
  assert.equal(db.queries.at(-1),'ROLLBACK');
  assert.equal(db.queries.some(x=>x.includes('pg_constraint')),false);
});
test('refuses write transaction and checks server fingerprint',async()=>{
  const db=fakeClient({readonly:'off'});
  await assert.rejects(readConstraintEvidence(db,confirmed),/DATABASE_IDENTITY_MISMATCH/);
  assert.equal(db.queries.at(-1),'ROLLBACK');
});
test('rejects unsupported actions and does not embed payment/provider API writes',()=>{
  const src=readFileSync(new URL('./inspect-ai-credit-lot-constraints-v12j8b.mjs',import.meta.url),'utf8');
  assert.match(src,/USAGE_INSPECT_ONLY/);
  assert.match(src,/AI_SETTLEMENT_EXPLICIT_APPROVAL_REQUIRED/);
  assert.match(src,/preflightBillingDevelopmentDatabase/);
  assert.doesNotMatch(src,/stripe\.com|openai\.com|\.subscriptions\.update|\.aiCreditLot\.update|\$executeRaw/);
});
test('first prior failure is a synchronous assertion, not an async Promise rejection',()=>{
  const src=readFileSync(new URL('../../../apps/web/src/lib/billing/aiCreditSettlementPostgres.acceptance.test.ts',import.meta.url),'utf8');
  assert.match(src,/expect\(\(\) => ledger\.releaseUnusedAiReservation/);
  assert.match(src,/providerNotBilledConfirmed: false as never}\)\)\.toThrow\("RELEASE_NOT_VERIFIED"\)/);
});
