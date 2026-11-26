import assert from "node:assert/strict";
import { test } from "vitest";
import { HOSTED_RUNTIME_KIND, HOSTED_RUNTIME_PROVIDER } from "./hostedActivationEvidence";
import { planHostedPublicationRecovery as plan, type HostedPublicationRecoveryInput as Input } from "./hostedPublicationRecovery";

const activation = {projectId:"project-one",sourceVersion:7,artifactHash:"a".repeat(64),objectSha256:"b".repeat(64),activatedAt:"2026-11-25T17:40:00.123456+00:00"};
const target = {deploymentId:"release-one",sourceVersion:7,artifactHash:activation.artifactHash,objectSha256:activation.objectSha256};
const project = {id:activation.projectId,status:"ready",stackId:"tanstack-start-v1",codeProjectArchived:false};
const deployment = {id:target.deploymentId,buildProjectId:project.id,sourceVersion:7,environment:"production",provider:HOSTED_RUNTIME_PROVIDER,kind:HOSTED_RUNTIME_KIND,status:"ready",artifactHash:target.artifactHash,providerRef:target.objectSha256};
const operation = {operationId:"operation-one",projectId:project.id,expectedGeneration:4n,action:"publish" as const,target};
const acknowledgement = {operationId:operation.operationId,projectId:project.id,fence:5n,state:"applied-active" as const,activation};
const baseline:Input = {operation,project,currentGeneration:4n,deployment,acknowledgement};
const unpublish = {...operation,action:"unpublish" as const,target:null};
function deny(changes:Partial<Input>,reason:string) { assert.deepEqual(plan({...baseline,...changes}),{state:"blocked",reason}); }
test("commits only exact operation acknowledgement, preserving microseconds",()=>{
  assert.deepEqual(plan(baseline),{state:"commit",operationId:operation.operationId,projectId:project.id,expectedGeneration:4n,generation:5n,deploymentId:target.deploymentId,activationToken:activation.activatedAt});
});
test("lost response or unknown outcome waits rather than retries or adopts",()=>{
  assert.deepEqual(plan({...baseline,acknowledgement:null}),{state:"await-provider"});
});
test("a matching runtime from a different operation is not recoverable",()=>deny({acknowledgement:{...acknowledgement,operationId:"operation-two"}},"ACKNOWLEDGEMENT_MISMATCH"));
test("rejects wrong project acknowledgement",()=>deny({acknowledgement:{...acknowledgement,projectId:"project-two"}},"ACKNOWLEDGEMENT_MISMATCH"));
test("rejects old and future fences",()=>{for(const fence of [4n,6n])deny({acknowledgement:{...acknowledgement,fence}},"ACKNOWLEDGEMENT_MISMATCH");});
test("advanced selection cannot be inferred as completion of pending journal",()=>{for(const currentGeneration of [3n,5n,6n])deny({currentGeneration},"STALE_GENERATION");});
test("authority failure cannot complete operation",()=>deny({currentGeneration:null},"AUTHORITY_UNAVAILABLE"));
test("invalid intent and exhausted generation are rejected",()=>{for(const expectedGeneration of [-1n,9223372036854775807n])deny({operation:{...operation,expectedGeneration}},"INVALID_INTENT");deny({operation:{...operation,operationId:""}},"INVALID_INTENT");});
test("archived or wrong project denied",()=>{for(const p of [null,{...project,status:"archived"},{...project,codeProjectArchived:true},{...project,id:"project-two"}])deny({project:p},"PROJECT_INELIGIBLE");});
test("same operation cannot acknowledge another release",()=>{for(const a of [{...activation,sourceVersion:8},{...activation,objectSha256:"c".repeat(64)},{...activation,artifactHash:"c".repeat(64)},{...activation,activatedAt:"bad"}])deny({acknowledgement:{...acknowledgement,activation:a}},"TARGET_MISMATCH");});
test("wrong deployment or provider is rejected by shared evidence",()=>{for(const d of [null,{...deployment,buildProjectId:"project-two"},{...deployment,provider:"legacy"},{...deployment,status:"failed"}])deny({deployment:d},"TARGET_MISMATCH");});
test("explicit rollback can target an older release",()=>{const a={...activation,sourceVersion:3};assert.equal(plan({...baseline,operation:{...operation,action:"rollback",target:{...target,sourceVersion:3}},deployment:{...deployment,sourceVersion:3},acknowledgement:{...acknowledgement,activation:a}}).state,"commit");});
test("unpublish requires its own durable inactive acknowledgement",()=>{assert.deepEqual(plan({...baseline,operation:unpublish,deployment:null,acknowledgement:{operationId:operation.operationId,projectId:project.id,fence:5n,state:"applied-inactive"}}),{state:"commit",operationId:operation.operationId,projectId:project.id,expectedGeneration:4n,generation:5n,deploymentId:null,activationToken:null});deny({operation:unpublish},"TARGET_MISMATCH");assert.deepEqual(plan({...baseline,operation:unpublish,acknowledgement:null}),{state:"await-provider"});});
test("inactive receipt cannot commit a publish",()=>deny({acknowledgement:{operationId:operation.operationId,projectId:project.id,fence:5n,state:"applied-inactive"}},"TARGET_MISMATCH"));
