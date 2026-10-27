import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const runner=resolve(root,'packages/db/scripts/run-zoebuild-real-provider-ledger-dev-v12j11b.mjs');
const acceptance=readFileSync(resolve(root,'apps/zoebuild/src/lib/build/realProviderLedger.postgres.acceptance.test.ts'),'utf8');
const key=Buffer.alloc(32,17).toString('base64'); // Synthetic format-only key, not a customer key.
const run=(args,env)=>spawnSync(process.execPath,[runner,...args],{
  cwd:root,encoding:'utf8',timeout:10000,
  env:{PATH:process.env.PATH??'',HOME:process.env.HOME??'',...env},
});
for(const ver of ['v1','v2','v3']){
  test(`writer ${ver} is checked without provider/DB calls`,()=>{
    const r=run(['--check-writer'],{
      ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID:ver,
      [`ZOEBUILD_AI_RESULT_KEY_${ver.toUpperCase()}`]:key,
    });
    assert.equal(r.status,0,r.stderr);
    assert.match(r.stdout,new RegExp(`V12K11B_ACTIVE_WRITER_PREFLIGHT_PASS active=${ver}`));
    assert.match(r.stdout,/providerCalls=0 databaseQueries=0 customerCharges=0/);
    assert.equal((r.stdout+r.stderr).includes(key),false);
  });
}
test('unknown key version or invalid secret refuses before external calls',()=>{
  for(const input of [
    {ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID:'v4',ZOEBUILD_AI_RESULT_KEY_V1:key},
    {ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID:'v1',ZOEBUILD_AI_RESULT_KEY_V1:'not-a-key'},
  ]){
    const r=run(['--check-writer'],input);
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/ACTIVE_WRITER_MISSING_OR_INVALID/);
    assert.match(r.stderr,/NO_PROVIDER_CALL=YES/);
  }
});
test('real paid mode still requires explicit multi-gate approval',()=>{
  const r=run(['--run'],{
    ZOEBUILD_AI_RESULT_ACTIVE_KEY_ID:'v1',ZOEBUILD_AI_RESULT_KEY_V1:key,
  });
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/APPROVAL_ISOLATION_OR_ACTIVE_WRITER_MISSING/);
  assert.match(r.stderr,/NO_PROVIDER_CALL=YES/);
});
test('acceptance uses active writer for keyring, journal and persisted keyId',()=>{
  assert.match(acceptance,/acceptedWriterId=activeId/);
  assert.match(acceptance,/if\(keyring.activeKeyId!==acceptedWriterId\)/);
  assert.match(acceptance,/activeKeyId:acceptedWriterId/);
  assert.match(acceptance,/expect\(journalRows\[0\]!\.keyId\)\.toBe\(acceptedWriterId\)/);
  assert.doesNotMatch(acceptance,/ACTIVE_V3_WRITER_REQUIRED|activeKeyId:"v3"/);
});
