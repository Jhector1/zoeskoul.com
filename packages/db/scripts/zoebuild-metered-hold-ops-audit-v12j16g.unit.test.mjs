import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHoldAuditArgs, requirePgUrl, assessHoldSnapshot, readOnlyHoldAudit,
 DEFAULT_AGE_MINUTES} from './zoebuild-metered-hold-ops-audit-v12j16g.mjs';

const zeros = Object.fromEntries(['held','aged','agedWithoutCase','agedWithoutDispatch',
 'agedDispatchWithoutResponse','agedWithPricedReceipt','agedWithUnpricedResponse',
 'settledMissingReceipt'].map(k=>[k,'0']));
function fakeDb({identity = {}, row = zeros, frozen = '0', conflicts = '0', failAt = ''} = {}) {
 const sql=[], output=[];
 let released=false,ended=false;
 const state={database:'learnoir_db', role:'admin', schema:'public', readonly:'on', replica:false,
   reservations:true,cases:true,dispatches:true,wallets:true,lots:true,...identity};
 const conn={
   query: async (q, params) => {
     sql.push({q,params});
     if (failAt && q.includes(failAt)) throw Error('synthetic pg error');
     if (q.includes('current_database()')) return {rows:[state]};
     if (q.includes('FROM public."AiCreditReservation" r')) return {rows:[row]};
     if (q.includes('FROM public."AiCreditWallet"')) return {rows:[{total:frozen}]};
     if (q.includes('FROM public."AiCreditReconciliationCase" c')) return {rows:[{total:conflicts}]};
     return {rows:[]};
   }, release:()=>{released=true;},
 };
 return {sql, output,
  makePool:()=>({connect:async()=>conn,end:async()=>{ended=true;}}),
  result:()=>({released,ended}), emit:v=>output.push(v)};
}
const valid = ['--audit','--database','learnoir_db','--role','admin'];
const run = async (db,args=valid, extras={})=>readOnlyHoldAudit({
 dbUrl:'postgresql://redacted@localhost/learnoir_db',args,makePool:db.makePool,
 emit:db.emit,now:new Date('2026-10-23T22:00:00.000Z'),...extras,
});

test('exact operator identity and URL guard; no default DB assumption',()=>{
 assert.deepEqual(parseHoldAuditArgs(['--inspect']),{mode:'inspect'});
 assert.deepEqual(parseHoldAuditArgs(valid).role,'admin');
 for(const args of [[],['--audit'],['--audit','--database','other'],
  ['--audit','--database','x;DROP','--role','admin'],['--inspect','--audit']]) {
   assert.throws(()=>parseHoldAuditArgs(args),/USAGE_/);
 }
 for(const url of ['', 'http://localhost/db','postgresql:///no','postgresql://host/db']) {
   assert.throws(()=>requirePgUrl(url),/DATABASE_URL_/);
 }
});

test('empty holds are not an operational approval',async()=>{
 const db=fakeDb();const result=await run(db);
 assert.equal(result.alert,false);
 assert.equal(result.summary.aged,'0');
 assert.ok(db.output.some(l=>l.includes('NOT_OPS_APPROVAL')));
 assert.deepEqual(db.result(),{released:true,ended:true});
 assert.equal(db.sql[0].q,'BEGIN READ ONLY');
 assert.equal(db.sql.at(-1).q,'ROLLBACK');
 assert.ok(db.sql.every(x=>!/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|COMMIT)\b/i.test(x.q)));
 assert.ok(db.output.every(x=>!x.includes('redacted')));
});

test('no hold details, identifiers, provider request payload or credentials logged',async()=>{
 const row={...zeros,held:'3',aged:'2',agedWithoutCase:'1',agedWithPricedReceipt:'1'};
 const db=fakeDb({row});const result=await run(db);
 assert.equal(result.alert,true);
 assert.equal(result.summary.agedWithoutCase,'1');
 assert.ok(db.output.some(l=>l==='V12J16G_REVIEW_STATUS=INVESTIGATE_HOLDS_OR_RISK'));
 assert.ok(db.output.every(l=>!/postgresql:\/\/|pass|secret|userId|idempotencyKey|resp_/i.test(l)));
});

test('frozen wallet and case ownership discrepancies require operator attention', async()=>{
 const db=fakeDb({frozen:'2',conflicts:'1'});
 const result=await run(db);
 assert.equal(result.alert,true);assert.equal(result.summary.frozenWallets,'2');
 assert.equal(result.summary.conflictingCases,'1');
});

test('inspect is read-only and does not inspect balances without explicit scoped audit',async()=>{
 const db=fakeDb();await run(db,['--inspect']);
 assert.deepEqual(db.sql.map(x=>x.q==='BEGIN READ ONLY'?'BEGIN':x.q==='ROLLBACK'?'ROLLBACK':'QUERY'),
   ['BEGIN','QUERY','ROLLBACK']);
 assert.ok(db.output[0].includes('readonly=YES writes=NO'));
});

test('misidentified database, missing schema, replica and invalid aggregate fail closed',async()=>{
 for(const fault of [
  {identity:{database:'production'}},
  {identity:{role:'unexpected'}},
  {identity:{dispatches:false}},
  {identity:{replica:true}},
  {row:{...zeros,aged:'-1'}},
  {row:{...zeros,held:'0',aged:'1'}},
 ]) {
  const db=fakeDb(fault);
  await assert.rejects(run(db),/MISMATCH|MISSING|INVALID|INCONSISTENT/);
  assert.deepEqual(db.result(),{released:true,ended:true});
  assert.equal(db.sql.at(-1).q,'ROLLBACK');
 }
});

test('errors roll back, and never retry requests or call a provider',async()=>{
 const db=fakeDb({failAt:'AiCreditReservation" r'});
 await assert.rejects(run(db),/synthetic pg error/);
 assert.equal(db.sql.filter(x=>x.q==='BEGIN READ ONLY').length,1);
 assert.equal(db.sql.filter(x=>x.q==='ROLLBACK').length,1);
 assert.deepEqual(db.result(),{released:true,ended:true});
 assert.equal(DEFAULT_AGE_MINUTES,15);
});

test('no incremental age counter overlap can hide an aged unjournaled hold',()=>{
 assert.equal(assessHoldSnapshot({...zeros,held:'3',aged:'2',agedWithoutCase:'2'},'0','0').alert,true);
 assert.throws(()=>assessHoldSnapshot({...zeros,held:'1',aged:'2'},'0','0'),/INCONSISTENT/);
});
