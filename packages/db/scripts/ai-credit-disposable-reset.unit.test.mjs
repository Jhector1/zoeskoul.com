import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CREDIT_TABLES, ATTEST, CONFIRM, RISK_TEST_ATTEST, NO_LIVE_FUNDS_ATTEST, assertTarget, assertApplyAuthorization,
  assertDisposableSignals, snapshotFingerprint,
} from './ai-credit-disposable-reset-policy.mjs';

const identity = { database:'disposable_db',schema:'public' };
const rows = CREDIT_TABLES.map(table=>({table,count:1,digest:'a'.repeat(32)}));
const fingerprint = snapshotFingerprint({identity,rows,liveStripeEvents:0,nonTestSignal:0});

test('all credit dependencies are explicitly scoped; no unrelated tables',()=>{
  assert.equal(new Set(CREDIT_TABLES).size,CREDIT_TABLES.length);
  const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8');
  for(const table of CREDIT_TABLES)assert.match(schema,new RegExp(`model ${table} \\{`));
  for(const unrelated of ['StripeEvent','User','Subscription','FeatureGrant','BuildProject','ZoeBuildChatMessage'])
    assert.equal(CREDIT_TABLES.includes(unrelated),false);
});

test('target mismatch and remote database refuse before connection',()=>{
  const params={url:'postgresql://user:pass@localhost:5432/disposable_db?schema=public',
    expectedHost:'localhost',expectedDatabase:'disposable_db',expectedSchema:'public'};
  assert.deepEqual(assertTarget(params),{host:'localhost',database:'disposable_db',schema:'public'});
  assert.throws(()=>assertTarget({...params,expectedDatabase:'other'}),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>assertTarget({...params,url:'postgresql://user:pass@prod.example/test?schema=public',expectedHost:'prod.example',expectedDatabase:'test'}),/NON_LOOPBACK_RESET_REFUSED/);
  assert.throws(()=>assertTarget({...params,expectedSchema:'other'}),/DATABASE_TARGET_MISMATCH/);
});

test('snapshot detects count or receipt digest drift',()=>{
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.notEqual(snapshotFingerprint({identity,rows:rows.map((row,i)=>i===3?{...row,digest:'b'.repeat(32)}:row),liveStripeEvents:0,nonTestSignal:0}),fingerprint);
  assert.notEqual(snapshotFingerprint({identity,rows:rows.map((row,i)=>i===2?{...row,count:2}:row),liveStripeEvents:0,nonTestSignal:0}),fingerprint);
});

test('apply requires all independent attestations and identical fingerprint',()=>{
  const argv=['--attest',ATTEST,'--confirm',CONFIRM,'--fingerprint',fingerprint,'--application-stopped'];
  assert.doesNotThrow(()=>assertApplyAuthorization({argv,fingerprint}));
  for(const item of [ATTEST,CONFIRM,fingerprint,'--application-stopped'])
    assert.throws(()=>assertApplyAuthorization({argv:argv.filter(x=>x!==item),fingerprint}),/APPLY_AUTHORIZATION_INCOMPLETE|MISSING_.*|DUPLICATE_FLAG/);
  assert.throws(()=>assertApplyAuthorization({argv,fingerprint:'f'.repeat(64)}),/APPLY_AUTHORIZATION_INCOMPLETE/);
});

test('live payments and payment risk prevent reset',()=>{
  assert.doesNotThrow(()=>assertDisposableSignals({liveStripeEvents:0,nonTestSignal:0}));
  assert.throws(()=>assertDisposableSignals({liveStripeEvents:1,nonTestSignal:0}),/LIVE_STRIPE_EVENTS/);
  assert.throws(()=>assertDisposableSignals({liveStripeEvents:0,nonTestSignal:1}),/PAYMENT_RISK/);
  assert.doesNotThrow(()=>assertDisposableSignals({liveStripeEvents:0,nonTestSignal:1,riskRecordsAttested:true}));
  assert.throws(()=>assertDisposableSignals({liveStripeEvents:1,nonTestSignal:1,riskRecordsAttested:true}),/LIVE_STRIPE_EVENTS/);
});

test('payment risk reset requires two additional independent test-only attestations',()=>{
  const base=['--attest',ATTEST,'--confirm',CONFIRM,'--fingerprint',fingerprint,'--application-stopped'];
  assert.throws(()=>assertApplyAuthorization({argv:base,fingerprint,paymentRiskRecords:6}),/PAYMENT_RISK_TEST_ONLY_ATTESTATION_REQUIRED/);
  assert.throws(()=>assertApplyAuthorization({argv:[...base,'--attest-test-only-risk',RISK_TEST_ATTEST],fingerprint,paymentRiskRecords:6}),/PAYMENT_RISK_TEST_ONLY_ATTESTATION_REQUIRED/);
  assert.doesNotThrow(()=>assertApplyAuthorization({argv:[...base,'--attest-test-only-risk',RISK_TEST_ATTEST,'--attest-no-live-funds',NO_LIVE_FUNDS_ATTEST],fingerprint,paymentRiskRecords:6}));
});

test('key provisioning writes 0600 file outside repository and refuses overwrite',()=>{
  const parent=mkdtempSync(join(tmpdir(),'zb-ai-key-test-'));
  const work=join(parent,'repo');
  const output=resolve(parent,'keys','ai-result-v1.env');
  const script=new URL('./provision-ai-result-key.mjs',import.meta.url).pathname;
  try {
    mkdirSync(work,{mode:0o700});
    const env={...process.env,ZOEBUILD_AI_RESULT_KEY_V1:'',ZOEBUILD_AI_RESULT_KEY_V2:''};
    const args=['--output',output,'--confirm-empty-result-journal'];
    const first=spawnSync(process.execPath,[script,...args],{cwd:work,env,encoding:'utf8'});
    assert.equal(first.status,0,first.stderr);
    assert.match(first.stdout,/KEY_PRINTED=NO/);
    const contents=readFileSync(output,'utf8');
    assert.match(contents,/ZOEBUILD_AI_RESULT_KEY_V1=[A-Za-z0-9+/]{43}=\n/);
    assert.equal(Buffer.from(contents.match(/KEY_V1=(.*)\n/)[1],'base64').length,32);
    assert.equal(statSync(output).mode & 0o777,0o600);
    const replay=spawnSync(process.execPath,[script,...args],{cwd:work,env,encoding:'utf8'});
    assert.notEqual(replay.status,0);
    assert.equal(readFileSync(output,'utf8'),contents);
    const bad=spawnSync(process.execPath,[script,'--output',join(work,'secret.env'),'--confirm-empty-result-journal'],{cwd:work,env,encoding:'utf8'});
    assert.notEqual(bad.status,0);
    assert.equal(existsSync(join(work,'secret.env')),false);
    // A lexical path through a symlink must not evade the canonical-root guard.
    const alias=join(parent,'work-alias');
    symlinkSync(work,alias,'dir');
    const aliased=spawnSync(process.execPath,[script,'--output',join(alias,'aliased.env'),'--confirm-empty-result-journal'],{cwd:work,env,encoding:'utf8'});
    assert.notEqual(aliased.status,0);
    assert.equal(existsSync(join(work,'aliased.env')),false);
  } finally {rmSync(parent,{recursive:true,force:true});}
});
