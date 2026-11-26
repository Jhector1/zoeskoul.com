import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateHostedActivation, HOSTED_RUNTIME_KIND, HOSTED_RUNTIME_PROVIDER,
  type HostedActivationInput, type HostedActivationDenial } from "./hostedActivationEvidence";

const activation = {projectId: "project-one", sourceVersion: 7, artifactHash: "a".repeat(64),
  objectSha256: "b".repeat(64), activatedAt: "2026-11-25T17:40:00.123456+00:00"};
const project = {id: activation.projectId, status: "ready", stackId: "tanstack-start-v1", codeProjectArchived: false};
const deployment = {id: "deployment-one", buildProjectId: project.id, sourceVersion: 7,
  environment: "production", provider: HOSTED_RUNTIME_PROVIDER, kind: HOSTED_RUNTIME_KIND,
  status: "ready", artifactHash: activation.artifactHash, providerRef: activation.objectSha256};
const selection = {state: "published" as const, deploymentId: deployment.id, activation};
const runtime = {state: "verified-active" as const, activation};
const baseline: HostedActivationInput = {project, deployment, selection, runtime};
function deny(changes: Partial<HostedActivationInput>, reason: HostedActivationDenial) {
  assert.deepEqual(evaluateHostedActivation({...baseline, ...changes}), {state: "denied", reason});
}

test("matches an explicitly selected, verified release", () => {
  assert.deepEqual(evaluateHostedActivation(baseline), {state:"eligible", deploymentId: deployment.id, activation});
});
test("denies missing, archived, and non-TanStack projects", () => {
  for (const value of [null, {...project,status:"archived"}, {...project,codeProjectArchived:true}, {...project,stackId:"react-v1"}]) {
    deny({project:value}, "PROJECT_INELIGIBLE");
  }
});
test("unpublish denies routing even with a retained active runtime", () => {
  deny({selection:{state:"unpublished"}}, "UNPUBLISHED");
});
test("unavailable authority never falls back to a ready deployment", () => {
  deny({selection:{state:"unavailable"}}, "AUTHORITY_UNAVAILABLE");
});
test("ready history cannot substitute for the selected deployment", () => {
  deny({deployment:null}, "DEPLOYMENT_MISMATCH");
  deny({deployment:{...deployment,id:"newer-deployment"}}, "DEPLOYMENT_MISMATCH");
});
test("cross-project deployment and selection identities are rejected", () => {
  deny({deployment:{...deployment,buildProjectId:"project-two"}}, "DEPLOYMENT_MISMATCH");
  deny({selection:{...selection,activation:{...activation,projectId:"project-two"}}}, "INVALID_SELECTION");
});
test("static, development, and incomplete records are not eligible", () => {
  for (const value of [{...deployment,provider:"zoebuild-self-hosted-v1",kind:"static-assets-v1"},
    {...deployment,environment:"development"}, {...deployment,status:"building"},
    {...deployment,artifactHash:null}, {...deployment,providerRef:null}]) {
    deny({deployment:value}, "DEPLOYMENT_MISMATCH");
  }
});
test("invalid selection metadata is denied", () => {
  for (const value of [{...activation,sourceVersion:0}, {...activation,sourceVersion:1.5},
    {...activation,artifactHash:"bad"}, {...activation,objectSha256:"bad"}, {...activation,activatedAt:"invalid"}]) {
    deny({selection:{...selection,activation:value}}, "INVALID_SELECTION");
  }
});
test("missing or unavailable runtime does not imply availability", () => {
  deny({runtime:{state:"inactive"}}, "RUNTIME_INACTIVE");
  deny({runtime:{state:"unavailable"}}, "RUNTIME_UNAVAILABLE");
});
test("rejects mismatches in every runtime identity field", () => {
  for (const value of [{...activation,projectId:"project-two"}, {...activation,sourceVersion:8},
    {...activation,artifactHash:"c".repeat(64)}, {...activation,objectSha256:"d".repeat(64)},
    {...activation,activatedAt:"2026-11-25T17:40:00.123457+00:00"}]) {
    deny({runtime:{...runtime,activation:value}}, "RUNTIME_MISMATCH");
  }
});
test("rejects record version or digest drift", () => {
  for (const value of [{...deployment,sourceVersion:8}, {...deployment,artifactHash:"c".repeat(64)},
    {...deployment,providerRef:"d".repeat(64)}]) deny({deployment:value}, "DEPLOYMENT_MISMATCH");
});
test("a verified rollback can select an older retained release explicitly", () => {
  const older = {...activation,sourceVersion:3,objectSha256:"e".repeat(64)};
  const result = evaluateHostedActivation({...baseline, selection:{...selection,activation:older},
    deployment:{...deployment,sourceVersion:3,providerRef:older.objectSha256}, runtime:{...runtime,activation:older}});
  assert.equal(result.state,"eligible");
});
