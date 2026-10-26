import {test} from 'node:test';
import assert from 'node:assert/strict';
import {purgeExpiredAiCreditResults} from './aiCreditResultRetention.ts';

test('retention performs a bounded journal-only operation, returning deleted count',async()=>{
  const calls=[];
  const client={$queryRaw:async(strings,...values)=>{
    calls.push({sql:strings.join('?'),values});
    return [{deleted:1}];
  }};
  const at=new Date('2026-10-23T18:00:00Z');
  const count=await purgeExpiredAiCreditResults({client,now:at,batchSize:2});
  assert.equal(count,1);assert.equal(calls.length,1);
  assert.match(calls[0].sql,/DELETE FROM "AiCreditResultJournal"/);
  assert.match(calls[0].sql,/FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql,/LIMIT \?/);
  assert.deepEqual(calls[0].values,[at,2]);
  assert.doesNotMatch(calls[0].sql,/"AiCreditLot"|"AiCreditLedgerEntry"|"AiCreditReservation"/);
});
test('invalid retention limits or clock refuse before SQL',async()=>{
 const client={$queryRaw:()=>{throw Error('called');}};
 for(const value of [-1,0,101,1.2,Number.NaN])
   await assert.rejects(purgeExpiredAiCreditResults({client,batchSize:value}),/AI_RESULT_RETENTION_INPUT_INVALID/);
 await assert.rejects(purgeExpiredAiCreditResults({client,now:new Date('invalid')}),/AI_RESULT_RETENTION_INPUT_INVALID/);
});
test('unexpected excess result rows refuse',async()=>{
 const client={$queryRaw:async()=>[{deleted:1},{deleted:1}]};
 await assert.rejects(purgeExpiredAiCreditResults({client,batchSize:1}),/AI_RESULT_RETENTION_OVER_LIMIT/);
});
