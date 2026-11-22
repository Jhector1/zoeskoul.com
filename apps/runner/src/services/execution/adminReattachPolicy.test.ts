import { test } from "vitest";
import assert from "node:assert/strict";
import { learningWindowOwnership } from "../sessions/learningWindowOwnership.js";
import type { SessionRecord } from "../sessions/sessionStore.js";
import { isGlobalAdminShell, mayAttachGlobalAdminShell } from "./adminReattachPolicy.js";
const actor = "u:" + "a".repeat(64);
const now = 10_000_000;
const base = { id: "session", ownerKey: actor, labMode: "admin", adminTopicSlug: "full-privileges", kind: "shell",
  state: "waiting_for_input", createdAt: now - 60_000, lastActivityAt: now - 1_000,
  idleTimeoutMs: 1_800_000, hardLifetimeMs: 7_200_000, attachStream: {}, containerId: "container" } as SessionRecord;
const allowed = (s: SessionRecord | null = base, a = actor, gate = true, t = now) => mayAttachGlobalAdminShell(s,a,gate,t);
test("actor-bound reattachment of a live shell never mutates session", () => {
  const before = JSON.stringify(base); assert.equal(allowed(), true); assert.equal(JSON.stringify(base),before);
});
test("missing session, other actor and anonymous actor denied", () => {
  assert.equal(allowed(null),false); assert.equal(allowed(base,"u:"+"b".repeat(64)),false); assert.equal(allowed({...base,ownerKey:"guest"},"guest"),false);
});
test("operator gate off denies attachment", () => assert.equal(allowed(base,actor,false),false));
test("ordinary and graded sessions excluded from new authorization", () => {
  for (const s of [{...base,labMode:"standard" as const},{...base,adminTopicSlug:"sudo-root-concepts"},{...base,kind:"code" as const}]) {
    assert.equal(isGlobalAdminShell(s),false); assert.equal(allowed(s),false);
  }
});
test("finalized, terminal and preparing sessions denied", () => {
  for(const state of ["completed","canceled","failed","timed_out","queued","preparing"] as const) assert.equal(allowed({...base,state}),false);
  assert.equal(allowed({...base,finalizedAt:now}),false);
});
test("missing stream or container denied", () => {
  assert.equal(allowed({...base,attachStream:null}),false); assert.equal(allowed({...base,containerId:""}),false);
});
test("exact idle deadline denied without a sweep", () => {
  const s = {...base,createdAt:now-2_000_000,lastActivityAt:now-1_800_000}; assert.equal(allowed(s),false); assert.equal(allowed(s,actor,true,now-1),true);
});
test("exact hard deadline denied despite recent activity", () => {
  const s = {...base,createdAt:now-7_200_000}; assert.equal(allowed(s),false); assert.equal(allowed(s,actor,true,now-1),true);
});
test("invalid limits or backwards clock fail closed", () => {
  for (const n of [null,0,-1,NaN,Infinity,1.5]) { assert.equal(allowed({...base,idleTimeoutMs:n}),false); assert.equal(allowed({...base,hardLifetimeMs:n}),false); }
  assert.equal(allowed({...base,lastActivityAt:now+1}),false); assert.equal(allowed({...base,createdAt:now}),false); assert.equal(allowed(base,actor,true,NaN),false);
});

test("conflicting window leaves existing administrator reattach authority unchanged",()=>{
  const owner="u:"+"c".repeat(64), first="window-aaaaaaaa", second="window-bbbbbbbb";
  const shell={...base,ownerKey:owner,adminWindowId:first};
  learningWindowOwnership.claim(owner,first,[]);
  assert.equal(mayAttachGlobalAdminShell(shell,owner,true,now),true);
  assert.throws(()=>learningWindowOwnership.claim(owner,second,[shell]),/user decision/);
  assert.equal(mayAttachGlobalAdminShell(shell,owner,true,now),true);
  learningWindowOwnership.claim(owner,second,[]);
  assert.equal(mayAttachGlobalAdminShell(shell,owner,true,now),false);
  assert.equal(mayAttachGlobalAdminShell({...shell,adminWindowId:second},owner,true,now),true);
  assert.equal(mayAttachGlobalAdminShell({...shell,adminWindowId:null},owner,true,now),false);
});
