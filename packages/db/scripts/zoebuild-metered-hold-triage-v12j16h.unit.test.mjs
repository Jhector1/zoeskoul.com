import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHoldAuditArgs, assessHoldTriage, readOnlyHoldAudit} from './zoebuild-metered-hold-ops-audit-v12j16g.mjs';

const zeros={held:'0',aged:'0',agedWithoutCase:'0',agedWithoutDispatch:'0',
 agedDispatchWithoutResponse:'0',agedWithPricedReceipt:'0',agedWithUnpricedResponse:'0',settledMissingReceipt:'0'};
const triage={total:'11',age15to60:'0',age60to1440:'1',ageOver1440:'10',
 noRecordedDispatch:'7',dispatchNoRecordedResponse:'2',recordedResponseWithoutReceipt:'0',
 pricedReceiptAwaitingSettlement:'2',missingCase:'11',withCase:'0',
 heldInFrozenWallet:'2',receiptWithoutResponseIdentity:'0'};
const args=['--triage','--database','learnoir_db','--role','admin'];
function mockDb({hasJournal=true, mismatch=false, failure=false}={}) {
 const log=[], sql=[];
 let inFlight=false; let released=false;let ended=false;
 const identity={database:'learnoir_db',role:'admin',schema:'public',readonly:'on',replica:false,
  reservations:true,cases:true,dispatches:true,wallets:true,lots:true,resultjournal:hasJournal};
 return {log,sql,done:()=>({released,ended}),
  makePool:()=>({connect:async()=>({
    query:async (q)=>{
      assert.equal(inFlight,false,'pg single client cannot execute concurrent queries');
      inFlight=true;
      try {
        sql.push(q);
        await Promise.resolve();
        if (failure && q.includes('WITH aged AS')) throw new Error('synthetic database failure');
        if(q.includes('current_database()')) return {rows:[identity]};
        if(q.includes('WITH aged AS')) return {rows:[mismatch?{...triage,total:'12'}:triage]};
        if(q.includes('FROM public."AiCreditResultJournal" j')) return {rows:[{total:'1'}]};
        if(q.includes('FROM public."AiCreditReservation" r'))return {rows:[{...zeros,held:'11',aged:'11',agedWithoutCase:'11',agedWithoutDispatch:'7',agedDispatchWithoutResponse:'2',agedWithPricedReceipt:'2'}]};
        if(q.includes('FROM public."AiCreditWallet"'))return {rows:[{total:'2'}]};
        if(q.includes('FROM public."AiCreditReconciliationCase" c'))return {rows:[{total:'0'}]};
        return {rows:[]};
      } finally {inFlight=false;}
    },release:()=>{released=true;}
  }),end:async()=>{ended=true;}}),emit:x=>log.push(x)};
}
const run=db=>readOnlyHoldAudit({
 args,dbUrl:'postgresql://ignored@localhost/learnoir_db',makePool:db.makePool,emit:db.emit,
 now:new Date('2026-10-24T03:11:46.635Z')});

test('explicit triage identity; no unscoped or user-supplied SQL',()=>{
 assert.deepEqual(parseHoldAuditArgs(args),{mode:'triage',database:'learnoir_db',role:'admin'});
 for(const a of [['--triage'],['--triage','--database','x'],['--triage','--database','x;DROP','--role','admin']])
   assert.throws(()=>parseHoldAuditArgs(a),/USAGE/);
});
test('cohorts and ages partition holds without identifiers',async()=>{
 const db=mockDb(); const result=await run(db);
 assert.equal(result.mode,'triage');assert.equal(result.triage.total,'11');
 assert.equal(result.triage.missingCase,'11');assert.equal(result.triage.agedWithResultJournal,'1');
 assert.equal(result.triage.heldInFrozenWallet,'2');
 assert.ok(db.log.includes('V12J16H_ACTION=RECONCILE_ORIGINAL_PROVIDER_EVIDENCE_BEFORE_ANY_LEDGER_WRITE'));
 assert.deepEqual(db.done(),{released:true,ended:true});
 assert.equal(db.sql[0],'BEGIN READ ONLY');assert.equal(db.sql.at(-1),'ROLLBACK');
 assert.ok(db.sql.every(q=>!/(?:\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCOMMIT\b|FOR UPDATE)/i.test(q)));
 assert.ok(db.log.every(v=>!/(?:idempotencyKey|userId|reservationId|providerResponseId|postgresql:\/\/)/.test(v)));
});
test('journal absence means unavailable, never zero',async()=>{
 const db=mockDb({hasJournal:false}); const result=await run(db);
 assert.equal(result.triage.agedWithResultJournal,'UNAVAILABLE');
 assert.equal(result.triage.journalAvailable,'NO');
 assert.equal(db.sql.some(x=>x.includes('FROM public."AiCreditResultJournal" j')),false);
});
test('invalid cohorts and inconsistent snapshot fail closed',async()=>{
 assert.throws(()=>assessHoldTriage({...triage,noRecordedDispatch:'8'},'1',true),/INCONSISTENT/);
 assert.throws(()=>assessHoldTriage({...triage,ageOver1440:'9'},'1',true),/INCONSISTENT/);
 assert.throws(()=>assessHoldTriage(triage,'12',true),/INCONSISTENT/);
 const db=mockDb({mismatch:true});await assert.rejects(run(db),/MISMATCH|INCONSISTENT/);
 assert.deepEqual(db.done(),{released:true,ended:true});
});
test('query failure causes rollback, never a write or retry',async()=>{
 const db=mockDb({failure:true});await assert.rejects(run(db),/synthetic database failure/);
 assert.equal(db.sql.filter(x=>x==='BEGIN READ ONLY').length,1);
 assert.equal(db.sql.filter(x=>x==='ROLLBACK').length,1);
 assert.deepEqual(db.done(),{released:true,ended:true});
});
