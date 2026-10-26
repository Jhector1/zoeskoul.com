import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnoseHistory, formatDiagnostic} from './diagnose-prisma-migration-history-v12j8e.mjs';
import {MIGRATION_NAME} from './apply-ai-credit-quantity-migration-v12j8d.mjs';
const checksum='a'.repeat(64), second='b'.repeat(64), third='c'.repeat(64);
const early='20261001000000_early';
const mid='20261015000000_middle';
const local=[{name:early,checksum},{name:mid,checksum:second},{name:MIGRATION_NAME,checksum:third}];
const good=(name,hash)=>({name,checksum:hash,finished:true,rolledBack:false});
const base=[good(early,checksum),good(mid,second)];
test('clean history passes with exactly one pending canonical migration',()=>{
  const d=diagnoseHistory(local,base);
  assert.equal(d.ok,true);
  assert.equal(d.counts.TARGET_PENDING_EXPECTED,1);
});
test('unknown database migration is reported by sanitized migration name',()=>{
  const d=diagnoseHistory(local,[...base,good('20260901000000_orphan',checksum)]);
  assert.equal(d.ok,false);assert.equal(d.counts.UNKNOWN_DATABASE_MIGRATION,1);
});
test('checksum drift remains blocking, never attempts automatic repair',()=>{
  const d=diagnoseHistory(local,[{...base[0],checksum:'d'.repeat(64)},base[1]]);
  assert.equal(d.counts.APPLIED_CHECKSUM_DIFFERENCE,1);assert.equal(d.ok,false);
  assert.doesNotMatch(formatDiagnostic(d),/dddddddd/);
});
test('unresolved failed or incomplete attempt identified separately',()=>{
  const d=diagnoseHistory(local,[base[0],{...base[1],finished:false}]);
  assert.equal(d.counts.UNRESOLVED_OR_INCOMPLETE_ATTEMPT,1);
  assert.equal(d.counts.UNAPPLIED_LOCAL_PREDECESSOR,1);
});
test('historical rolled-back attempts require review, including followed by success',()=>{
  const d=diagnoseHistory(local,[{...base[0],finished:false,rolledBack:true},...base]);
  assert.equal(d.counts.ROLLED_BACK_ATTEMPT_REQUIRES_REVIEW,1);
  assert.equal(d.ok,false);
});
test('duplicate active migration history remains blocked',()=>{
  const d=diagnoseHistory(local,[base[0],base[0],base[1]]);
  assert.equal(d.counts.DUPLICATE_NON_ROLLED_BACK_HISTORY,1);
});
test('applied target is separately identified for postflight investigation',()=>{
  const d=diagnoseHistory(local,[...base,good(MIGRATION_NAME,third)]);
  assert.equal(d.counts.TARGET_ALREADY_APPLIED,1);
});
test('bad migration metadata fails rather than silently accepting',()=>{
  assert.throws(()=>diagnoseHistory(local,[{...base[0],name:'../foo'}]),/V12J8E_INVALID_HISTORY_DATA/);
  assert.throws(()=>diagnoseHistory(local,[{...base[0],finished:null}]),/V12J8E_INVALID_HISTORY_DATA/);
});
test('caps diagnostic output and does not expose checksums',()=>{
  const extra=Array.from({length:50},(_,i)=>good(`202609${String(i+1).padStart(2,'0')}000000_orphan`,checksum));
  const d=diagnoseHistory(local,[...base,...extra]);
  assert.ok(d.truncated>0);assert.equal(d.findings.length,30);
  assert.doesNotMatch(formatDiagnostic(d),new RegExp(checksum));
});
test('read-only script reuses exact verified preflight and readHistory; no schema writes',()=>{
  const src=readFileSync(new URL('./diagnose-prisma-migration-history-v12j8e.mjs',import.meta.url),'utf8');
  assert.match(src,/readHistory\(client,identity\)/);
  assert.match(src,/preflightBillingDevelopmentDatabase/);
  assert.match(src,/listLocalMigrations\(\)/);
  assert.doesNotMatch(src,/migrate deploy|migrate resolve|ALTER TABLE|UPDATE public|DELETE FROM|INSERT INTO|CREATE TABLE|spawnSync/);
});
