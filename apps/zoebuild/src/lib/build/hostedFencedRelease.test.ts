import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./privatePublishControl",()=>({hostedPublishSelection:()=>({ownerId:"owner-one"}),invokeHostedFencedCommand:vi.fn()}));
vi.mock("./hostedFencedPublication",()=>({executeOwnedFencedPublication:vi.fn(),recoverOwnedFencedPublication:vi.fn()}));
import { fencedBundleKey, pendingIntent, selectsFencedRelease, verifyFencedCandidate } from "./hostedFencedRelease";
const s={ownerId:"owner-one",projectId:"project-one",hostname:"alpha.sites.zoebuild.test"};
const bytes=Buffer.from("verified bundle");
const objectSha256=createHash("sha256").update(bytes).digest("hex");
const target={sourceVersion:7,artifactHash:"a".repeat(64),objectSha256};
const ref={kind:"worker-bundle-v1" as const,ownerId:s.ownerId,buildProjectId:s.projectId,sourceVersion:7,artifactSha256:target.artifactHash,objectSha256,snapshotSha256:"b".repeat(64),objectKey:fencedBundleKey(s.ownerId,s.projectId,target),artifactFiles:3,artifactBytes:40};
const row={id:"operation-one",buildProjectId:s.projectId,requestedByOwnerId:s.ownerId,expectedGeneration:9007199254740993n,action:"publish",targetDeploymentId:"deployment-one",targetSourceVersion:7,targetArtifactHash:target.artifactHash,targetObjectSha256:objectSha256};
test("fenced lane is an explicit single-project opt-in",()=>{assert.equal(selectsFencedRelease(s.projectId,{}),false);assert.equal(selectsFencedRelease(s.projectId,{ZOEBUILD_HOSTED_FENCED_DEV:"1"}),false);assert.equal(selectsFencedRelease(s.projectId,{ZOEBUILD_HOSTED_FENCED_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:s.projectId}),true);assert.equal(selectsFencedRelease("other-project",{ZOEBUILD_HOSTED_FENCED_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:s.projectId}),false);});
test("stable deployment identity and exact private bundle key",()=>{const a=verifyFencedCandidate(s,ref,bytes);assert.deepEqual(a,verifyFencedCandidate(s,ref,bytes));assert.equal(a.objectSha256,objectSha256);assert.match(a.deploymentId,/^hosted-[a-f0-9]{64}$/);});
test("reject wrong bundle or scope before persistence",()=>{for(const bad of [{...ref,ownerId:"owner-two"},{...ref,buildProjectId:"project-two"},{...ref,objectKey:"bad"},{...ref,artifactBytes:-1},{...ref,snapshotSha256:"bad"}])assert.throws(()=>verifyFencedCandidate(s,bad,bytes));assert.throws(()=>verifyFencedCandidate(s,ref,Buffer.from("different")));});
test("pending recovery reconstructs exact journal intent without generation rounding",()=>{const op=pendingIntent(s,row);assert.equal(op.expectedGeneration,row.expectedGeneration);assert.equal(op.operationId,row.id);assert.deepEqual(op.target,{deploymentId:row.targetDeploymentId,...target});});
test("reject cross-tenant or malformed journal",()=>{for(const bad of [{...row,requestedByOwnerId:"owner-two"},{...row,buildProjectId:"project-two"},{...row,targetSourceVersion:null},{...row,action:"unknown"},{...row,expectedGeneration:-1n}])assert.throws(()=>pendingIntent(s,bad));});
test("unpublish requires a null target",()=>{assert.throws(()=>pendingIntent(s,{...row,action:"unpublish"}));assert.equal(pendingIntent(s,{...row,action:"unpublish",targetDeploymentId:null,targetSourceVersion:null,targetArtifactHash:null,targetObjectSha256:null}).target,null);});

// The actual journal executor has independent real-PostgreSQL acceptance.
// These tests exercise the application dispatch boundary using controlled mocks.
import type { PrismaClient } from "@zoeskoul/db";
import { inspectFencedRelease } from "./hostedFencedRelease";
import { executeOwnedFencedPublication, recoverOwnedFencedPublication } from "./hostedFencedPublication";
function fakeClient(){
  const tx={buildProject:{findFirst:async()=>({hostedActivation:{generation:row.expectedGeneration}})},buildHostedPublicationOperation:{findFirst:async()=>row}};
  return {$transaction:async(f:(arg:typeof tx)=>unknown)=>f(tx)} as unknown as PrismaClient;
}
async function optedIn(f:()=>Promise<void>){
  const keys=["ZOEBUILD_HOSTED_FENCED_DEV","ZOEBUILD_HOSTED_FENCED_DEV_PROJECT"] as const;
  const old=keys.map(k=>process.env[k]);
  process.env[keys[0]]="1";process.env[keys[1]]=s.projectId;
  try{await f();}finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
}
test("unknown outcome reads acknowledgement without dispatch or artifact read",async()=>optedIn(async()=>{
  vi.mocked(recoverOwnedFencedPublication).mockResolvedValue({state:"await-provider"});
  vi.mocked(executeOwnedFencedPublication).mockClear();
  const result=await inspectFencedRelease(fakeClient(),s,null,()=>{throw new Error("must not read storage");});
  assert.deepEqual(result,{state:"pending",operationId:row.id});
  assert.equal(vi.mocked(executeOwnedFencedPublication).mock.calls.length,0);
}));
test("explicit retry rejects changed id and invalid original bundle",async()=>optedIn(async()=>{
  vi.mocked(recoverOwnedFencedPublication).mockResolvedValue({state:"await-provider"});
  vi.mocked(executeOwnedFencedPublication).mockClear();
  await assert.rejects(inspectFencedRelease(fakeClient(),s,"operation-other",()=>{throw new Error("must not read storage");}),/FENCED_RETRY_MISMATCH/);
  await assert.rejects(inspectFencedRelease(fakeClient(),s,row.id,()=>({read:async()=>Buffer.from("wrong")})),/FENCED_RETRY_BUNDLE_INVALID/);
  assert.equal(vi.mocked(executeOwnedFencedPublication).mock.calls.length,0);
}));
test("explicit retry dispatches original journal intent with verified bundle",async()=>optedIn(async()=>{
  const op=pendingIntent(s,row);
  vi.mocked(recoverOwnedFencedPublication).mockResolvedValue({state:"await-provider"});
  vi.mocked(executeOwnedFencedPublication).mockClear();
  const completed={state:"completed" as const,operation:op,generation:op.expectedGeneration+1n,activationToken:"2026-11-25T18:00:00.123456+00:00"};
  vi.mocked(executeOwnedFencedPublication).mockResolvedValue(completed);
  const result=await inspectFencedRelease(fakeClient(),s,row.id,()=>({read:async(key)=>{assert.equal(key,ref.objectKey);return bytes;}}));
  assert.deepEqual(result,{state:"completed",record:completed});
  assert.deepEqual(vi.mocked(executeOwnedFencedPublication).mock.calls[0].slice(1),[op,bytes]);
}));
