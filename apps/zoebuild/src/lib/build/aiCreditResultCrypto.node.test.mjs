import {test} from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { aiCreditResultKey, aiCreditResultKeyring, sealAiCreditResult, openAiCreditResult,
 AI_RESULT_MAX_BYTES, AI_RESULT_TTL_MS } from "./aiCreditResultCrypto.ts";
const secret=randomBytes(32).toString("base64");
const key=aiCreditResultKey(secret);
const identity={userId:"user-a",idempotencyKey:"zb:edit:p1:uuid:edit",
 requestSha256:createHash("sha256").update("request").digest("hex"),providerResponseId:"resp_a"};
const result={text:'{"hello":"world"}',usage:{provider:"openai",inputTokens:22,
 outputTokens:9,cachedInputTokens:2,cacheWriteInputTokens:0,
 reasoningOutputTokens:null,providerRaw:{sensitive:"omit"}},metadata:{provider:"openai",
 model:"gpt-test",temperature:0,schemaName:"test",serviceTier:"default",
 providerResponseId:"resp_a",providerHttpRequestId:"req_a"}};
test("strict 256-bit key, no implicit default or malformed key",()=>{
 assert.equal(key.length,32);
 for(const bad of [undefined,"",secret.slice(1),"a".repeat(44),secret+"\n"])
  assert.throws(()=>aiCreditResultKey(bad),/AI_RESULT_ENCRYPTION_KEY_/);
});
test("AES-GCM round trips the useful output and strips raw provider internals",()=>{
 const sealed=sealAiCreditResult({identity,key,result});
 assert.ok(!JSON.stringify(sealed).includes("hello"));
 assert.equal(sealed.keyId,"v1");
 const opened=openAiCreditResult({identity,key,sealed});
 assert.equal(opened.text,result.text);
 assert.deepEqual(opened.usage.providerRaw,{});
 assert.equal(opened.metadata.providerResponseId,"resp_a");
});
test("encryption nonce is fresh for repeat with identical output",()=>{
 const a=sealAiCreditResult({identity,key,result});
 const b=sealAiCreditResult({identity,key,result});
 assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.ciphertext,b.ciphertext);
 assert.equal(a.contentSha256,b.contentSha256);
});
test("AAD binds user, operation, request fingerprint and provider response",()=>{
 const sealed=sealAiCreditResult({identity,key,result});
 for(const patch of [{userId:"user-b"},{idempotencyKey:"other"},
  {requestSha256:"f".repeat(64)},{providerResponseId:"resp_b"}]){
  assert.throws(()=>openAiCreditResult({identity:{...identity,...patch},key,sealed}),
    /AI_RESULT_AUTHENTICATION_FAILED/);
 }
});
test("tampered ciphertext, auth tag and wrong key cannot be used",()=>{
 const sealed=sealAiCreditResult({identity,key,result});
 for(const patch of [{ciphertext:"AAAA"},{tag:"AAAA"},{contentSha256:"f".repeat(64)}])
  assert.throws(()=>openAiCreditResult({identity,key,sealed:{...sealed,...patch}}),
    /AI_RESULT_AUTHENTICATION_FAILED/);
 assert.throws(()=>openAiCreditResult({identity,key:randomBytes(32),sealed}),
  /AI_RESULT_AUTHENTICATION_FAILED/);
});
test("rejects result response mismatch and overlarge recoverable results",()=>{
 assert.throws(()=>sealAiCreditResult({identity,key,result:{...result,
  metadata:{...result.metadata,providerResponseId:"resp_x"}}}),/AI_RESULT_RESPONSE_MISMATCH/);
 assert.throws(()=>sealAiCreditResult({identity,key,result:{...result,text:"x".repeat(AI_RESULT_MAX_BYTES+1)}}),
  /AI_RESULT_TOO_LARGE/);
});
test("retention is 24 hours and no raw provider evidence is exposed",()=>{
 assert.equal(AI_RESULT_TTL_MS,86_400_000);
 const sealed=sealAiCreditResult({identity,key,result});
 for(const v of Object.values(sealed)) assert.ok(!String(v).includes("sensitive"));
});

const secondSecret=randomBytes(32).toString("base64");
test("v1 ciphertext remains decryptable during phased v2 key rotation",()=>{
  const ring=aiCreditResultKeyring({v1:secret,v2:secondSecret,activeKeyId:"v2"});
  assert.equal(ring.activeKeyId,"v2");
  const older=sealAiCreditResult({identity,key:ring.keys.v1,result});
  const newer=sealAiCreditResult({identity,key:ring.keys.v2,keyId:ring.activeKeyId,result});
  assert.equal(older.keyId,"v1");assert.equal(newer.keyId,"v2");
  assert.equal(openAiCreditResult({identity,key:ring.keys.v1,sealed:older}).text,result.text);
  assert.equal(openAiCreditResult({identity,key:ring.keys.v2,sealed:newer}).text,result.text);
  assert.throws(()=>openAiCreditResult({identity,key:ring.keys.v1,sealed:newer}),/AI_RESULT_AUTHENTICATION_FAILED/);
});
test("rotation requires distinct retained v1/v2 keys and valid active selection",()=>{
  assert.throws(()=>aiCreditResultKeyring({v2:secondSecret,activeKeyId:"v2"}),/AI_RESULT_V1_KEY_RETAIN_UNTIL_AUDIT/);
  assert.throws(()=>aiCreditResultKeyring({v1:secret,activeKeyId:"v2"}),/AI_RESULT_ACTIVE_KEY_MISSING/);
  assert.throws(()=>aiCreditResultKeyring({v1:secret,v2:secret,activeKeyId:"v2"}),/AI_RESULT_KEY_ROTATION_REQUIRES_DISTINCT_KEY/);
  assert.throws(()=>aiCreditResultKeyring({v1:secret,activeKeyId:"v3"}),/AI_RESULT_ACTIVE_KEY_MISSING/);
  assert.equal(aiCreditResultKeyring({v1:secret}).activeKeyId,"v1");
});
