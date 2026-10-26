import {test} from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {getOrCreateAiBrowserAttempt,completeAiBrowserAttempt,AI_ATTEMPT_TTL_MS}
  from "./aiBrowserAttemptRecovery.ts";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
function memory(){const map=new Map();return {
 getItem(k){return map.get(k)??null},setItem(k,v){map.set(k,v)},removeItem(k){map.delete(k)},map,
};}
const options={projectId:"project_1",sourceVersion:4,prompt:"Please edit the page",files:[],
 previousInstructions:["prior user context"],
 conversation:[JSON.stringify({role:"user",text:"Our Approach page"})],uuid:()=>"8d352d31-5185-4b22-b670-f8edc0674e13"};
const req=(storage,other={})=>({storage,...options,...other});
test("identical retry after simulated refresh reuses ID and frozen history",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000001,previousInstructions:[]}));
 assert.equal(a.id,b.id);assert.equal(b.recovered,true);
 assert.deepEqual(b.previousInstructions,["prior user context"]);
 assert.deepEqual(b.conversation,options.conversation);
 const raw=[...storage.map.values()].join("");
 assert.ok(!raw.includes("Please edit the page"));
});
test("completion removes only the matching attempt and new submission receives new UUID",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 completeAiBrowserAttempt({storage,projectId:options.projectId,id:a.id});
 assert.equal(storage.map.size,0);
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000002,uuid:()=>"ce78ae1f-df50-49f6-9a20-a8789d2f7a0c"}));
 assert.notEqual(b.id,a.id);assert.equal(b.recovered,false);
});
test("changed source version or prompt cannot inherit an older charged identity",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000001,sourceVersion:5,
   uuid:()=>"ce78ae1f-df50-49f6-9a20-a8789d2f7a0c"}));
 assert.notEqual(a.id,b.id);
 const c=await getOrCreateAiBrowserAttempt(req(storage,{now:1000002,prompt:"Different instruction",
   uuid:()=>"58f9ad73-501a-489c-afab-98bb19b3ac2b"}));
 assert.notEqual(a.id,c.id);
});
test("different project does not see another project's attempt",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000,projectId:"project_2",
   uuid:()=>"ce78ae1f-df50-49f6-9a20-a8789d2f7a0c"}));
 assert.notEqual(a.id,b.id);assert.equal(storage.map.size,2);
});
test("expired matching attempt refuses a silent second paid dispatch",async()=>{
 const storage=memory();await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage,{now:1000000+AI_ATTEMPT_TTL_MS})),
  /AI_ATTEMPT_EXPIRED_REVIEW_REQUIRED/);
});
test("corrupt storage and storage refusal fail closed",async()=>{
 const storage=memory();storage.setItem("zoebuild:ai-attempt:v11c:project_1","broken");
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage)),/AI_ATTEMPT_STORAGE_REVIEW_REQUIRED/);
 const broken={getItem:()=>{throw Error("denied")},setItem:()=>{},removeItem:()=>{}};
 await assert.rejects(getOrCreateAiBrowserAttempt(req(broken)),/AI_ATTEMPT_STORAGE_UNAVAILABLE/);
});
test("missing crypto/invalid UUID/oversized frozen context never stores",async()=>{
 const storage=memory();
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage,{uuid:()=>"bad"})),/AI_ATTEMPT_UUID_INVALID/);
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage,{previousInstructions:["x".repeat(32769)]})),
  /AI_ATTEMPT_CONTEXT_TOO_LARGE/);
 assert.equal(storage.map.size,0);
});
test("multiple pending requests preserve distinct identities and completed removal is isolated",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000001,prompt:"Other request",
  uuid:()=>"ce78ae1f-df50-49f6-9a20-a8789d2f7a0c"}));
 completeAiBrowserAttempt({storage,projectId:options.projectId,id:b.id});
 const recovered=await getOrCreateAiBrowserAttempt(req(storage,{now:1000002}));
 assert.equal(recovered.id,a.id);
});
test("exhausted pending capacity prevents eviction of financially uncertain attempts",async()=>{
 const storage=memory();const uuids=[
  "8d352d31-5185-4b22-b670-f8edc0674e13","ce78ae1f-df50-49f6-9a20-a8789d2f7a0c",
  "58f9ad73-501a-489c-afab-98bb19b3ac2b","91f9ad73-501a-489c-afab-98bb19b3ac2b",
  "a1f9ad73-501a-489c-afab-98bb19b3ac2b","b1f9ad73-501a-489c-afab-98bb19b3ac2b",
 ];
 for(let i=0;i<6;i++)await getOrCreateAiBrowserAttempt(req(storage,{now:1000000+i,
  prompt:`prompt_${i}`,uuid:()=>uuids[i]}));
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage,{now:1000007,prompt:"seventh"})),
   /AI_ATTEMPT_CAPACITY_REVIEW_REQUIRED/);
});

test("frozen conversation survives reload; later conversation is never substituted",async()=>{
 const storage=memory();const a=await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const b=await getOrCreateAiBrowserAttempt(req(storage,{now:1000001,conversation:["other later chat"]}));
 assert.equal(a.id,b.id);
 assert.deepEqual(b.conversation,options.conversation);
});
test("pre-upgrade pending records remain review-required, never silently cleared",async()=>{
 const storage=memory();await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const key=[...storage.map.keys()][0];const value=JSON.parse(storage.getItem(key));
 delete value.attempts[0].conversation;storage.setItem(key,JSON.stringify(value));
 const recovered=await getOrCreateAiBrowserAttempt(req(storage,{now:1000001}));
 assert.equal(recovered.recovered,true);assert.equal(recovered.conversation,null);
 assert.equal(storage.map.size,1);
});
test("tampered or oversized saved conversation fails closed",async()=>{
 const storage=memory();await getOrCreateAiBrowserAttempt(req(storage,{now:1000000}));
 const key=[...storage.map.keys()][0];const value=JSON.parse(storage.getItem(key));
 value.attempts[0].conversation=["x".repeat(1001)];storage.setItem(key,JSON.stringify(value));
 await assert.rejects(getOrCreateAiBrowserAttempt(req(storage)),/AI_ATTEMPT_STORAGE_REVIEW_REQUIRED/);
 const fresh=memory();
 await assert.rejects(getOrCreateAiBrowserAttempt(req(fresh,{conversation:["x".repeat(1001)]})),/AI_ATTEMPT_CONVERSATION_INVALID/);
 assert.equal(fresh.map.size,0);
});
