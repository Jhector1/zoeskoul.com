import {describe,it,expect} from "vitest";
import {randomBytes,createHash} from "node:crypto";
import {aiCreditResultKeyring,sealAiCreditResult,openAiCreditResult} from "./aiCreditResultCrypto";
const v1=randomBytes(32).toString("base64"),v3=randomBytes(32).toString("base64");
const identity={userId:"owner",idempotencyKey:"operation",requestSha256:createHash("sha256").update("payload").digest("hex"),providerResponseId:"resp_123"};
const result={text:"a long project answer",usage:{provider:"openai",inputTokens:10,outputTokens:50,cachedInputTokens:0,cacheWriteInputTokens:0,reasoningOutputTokens:null,providerRaw:{}},metadata:{provider:"openai",model:"gpt",providerResponseId:"resp_123",serviceTier:"default"}} as const;
describe("V12J.18 independent v3 encryption writer",()=>{
 it("writes/reads new v3 results even without legacy decryption keys",()=>{
   const ring=aiCreditResultKeyring({v3,activeKeyId:"v3"});
   expect(ring.keys.v1).toBeUndefined();
   const sealed=sealAiCreditResult({identity,key:ring.keys.v3!,keyId:ring.activeKeyId,result:result as any});
   expect(sealed.keyId).toBe("v3");
   expect(openAiCreditResult({identity,key:ring.keys.v3!,sealed}).text).toBe(result.text);
 });
 it("does not mislabel old v1 ciphertext as readable by v3",()=>{
   const original=sealAiCreditResult({identity,key:Buffer.from(v1,"base64"),result:result as any});
   const ring=aiCreditResultKeyring({v3,activeKeyId:"v3"});
   expect(ring.keys[original.keyId as "v1"]).toBeUndefined();
   expect(()=>openAiCreditResult({identity,key:ring.keys.v3!,sealed:original})).toThrow("AI_RESULT_AUTHENTICATION_FAILED");
 });
 it("rejects a duplicate key under two version identities",()=>{
   expect(()=>aiCreditResultKeyring({v1:v3,v3,activeKeyId:"v3"})).toThrow("AI_RESULT_KEY_ROTATION_REQUIRES_DISTINCT_KEY");
 });
});
