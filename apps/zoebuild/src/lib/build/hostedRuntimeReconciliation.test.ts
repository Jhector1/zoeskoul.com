import assert from "node:assert/strict";
import {test,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {hostedEvidenceFromStatus,reconcileHostedRuntimeObservation,reconcileOwnedHostedRuntime,HOSTED_OBSERVATION_BUDGET_MS,HOSTED_RECONCILIATION_BUDGET_MS} from "./hostedRuntimeReconciliation";
import {evaluateHostedActivation,HOSTED_RUNTIME_KIND,HOSTED_RUNTIME_PROVIDER,type HostedRuntimeEvidence} from "./hostedActivationEvidence";
import type {HostedSelectionObservation} from "./hostedActivationSelection";
import type {PrismaClient} from "@zoeskoul/db";

const projectId="project-one";
const receipt={deploymentId:"b".repeat(64),artifactHash:"a".repeat(64),sourceVersion:7,
  deployedAt:"2026-11-25T17:40:00.123456+00:00",publicUrl:"http://127.0.0.1:33105/",privatePilot:true as const};
const active={projectId,sourceVersion:7,artifactHash:receipt.artifactHash,objectSha256:receipt.deploymentId,activatedAt:receipt.deployedAt};
const runtime={state:"verified-active",activation:active} as const;
function fixture(){
  const f={generation:1n,selected:true,eligible:true,clock:0,reads:0,probes:0,throwRead:false,throwStatus:false,
    evidence:runtime as HostedRuntimeEvidence, chosen:active, onRead:()=>{},onStatus:()=>{}};
  const readers={now:()=>f.clock,status:async()=>{f.probes++;f.onStatus();if(f.throwStatus)throw Error("transport");return f.evidence;},
    observe:async(evidence:HostedRuntimeEvidence):Promise<HostedSelectionObservation>=>{
      f.reads++;f.onRead();if(f.throwRead)throw Error("db");
      return {generation:f.generation,evidence:evaluateHostedActivation({
        project:f.eligible?{id:projectId,status:"ready",stackId:"tanstack-start-v1",codeProjectArchived:false}:null,
        selection:f.selected?{state:"published",deploymentId:"release-one",activation:f.chosen}:{state:"unpublished"},
        deployment:{id:"release-one",buildProjectId:projectId,sourceVersion:f.chosen.sourceVersion,environment:"production",
          provider:HOSTED_RUNTIME_PROVIDER,kind:HOSTED_RUNTIME_KIND,status:"ready",artifactHash:f.chosen.artifactHash,providerRef:f.chosen.objectSha256},runtime:evidence})};
    }};
  return {f,readers};
}
const reason=async (readers:ReturnType<typeof fixture>["readers"],expected:string)=>{
  const result=await reconcileHostedRuntimeObservation(readers);assert.equal(result.evidence.state,"denied");
  if(result.evidence.state==="denied")assert.equal(result.evidence.reason,expected);
};
test("maps immutable object digest, not a database id, and preserves exact token",()=>{
  assert.deepEqual(hostedEvidenceFromStatus(projectId,receipt),runtime);
});
test("null is inactive; malformed or non-pilot status is unavailable",()=>{
  assert.deepEqual(hostedEvidenceFromStatus(projectId,null),{state:"inactive"});
  for(const value of [{...receipt,deployedAt:"bad"},{...receipt,sourceVersion:0},{...receipt,deploymentId:"release-one"},
    {...receipt,artifactHash:"bad"},{...receipt,privatePilot:false}]){
    assert.deepEqual(hostedEvidenceFromStatus(projectId,value as typeof receipt),{state:"unavailable"});}
});
test("matching double observation uses three database reads and two runtime reads",async()=>{
  const {f,readers}=fixture();const o=await reconcileHostedRuntimeObservation(readers);
  assert.deepEqual(o,{generation:1n,evidence:{state:"eligible",deploymentId:"release-one",activation:active}});
  assert.equal(f.reads,3);assert.equal(f.probes,2);
});
test("unpublished and ineligible projects never contact runtime",async()=>{
  const {f,readers}=fixture();f.selected=false;await reason(readers,"UNPUBLISHED");f.eligible=false;
  await reason(readers,"PROJECT_INELIGIBLE");assert.equal(f.probes,0);
});
test("database failure never contacts runtime",async()=>{
  const {f,readers}=fixture();f.throwRead=true;await reason(readers,"AUTHORITY_UNAVAILABLE");assert.equal(f.probes,0);
});
test("runtime transport error and inactive status fail closed",async()=>{
  const {f,readers}=fixture();f.throwStatus=true;await reason(readers,"RUNTIME_UNAVAILABLE");
  f.throwStatus=false;f.evidence={state:"inactive"};await reason(readers,"RUNTIME_INACTIVE");
});
test("runtime change between observations is denied",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{if(f.probes===2)f.evidence={state:"verified-active",activation:{...active,activatedAt:"2026-11-25T17:40:00.123457+00:00"}};};
  await reason(readers,"RUNTIME_MISMATCH");
});
test("unpublish during observation denies old runtime",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{if(f.probes===2){f.selected=false;f.generation++;}};await reason(readers,"UNPUBLISHED");
});
test("generation change even with same activation denies observation",async()=>{
  const {f,readers}=fixture();f.onRead=()=>{if(f.reads===3)f.generation++;};await reason(readers,"SELECTION_CHANGED");
});
test("late or reversed monotonic clock fails closed",async()=>{
  for(const clock of [HOSTED_OBSERVATION_BUDGET_MS,-1,NaN]){const {f,readers}=fixture();f.onStatus=()=>{f.clock=clock;};await reason(readers,"OBSERVATION_EXPIRED");}
});
test("second database read failure cannot return cached eligibility",async()=>{
  const {f,readers}=fixture();f.onRead=()=>{if(f.reads===3)f.throwRead=true;};await reason(readers,"AUTHORITY_UNAVAILABLE");
});
test("production gate prevents any database or runtime observation",async()=>{
  vi.stubEnv("NODE_ENV","production");
  try {const result=await reconcileOwnedHostedRuntime({} as PrismaClient,{ownerId:"owner-one",buildProjectId:projectId});
    assert.deepEqual(result,{generation:null,evidence:{state:"denied",reason:"PILOT_DISABLED"}});
  } finally {vi.unstubAllEnvs();}
});

test("two fresh cycles can exceed ten seconds in total without extending either cycle",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock+=5200;};
  const result=await reconcileHostedRuntimeObservation(readers);
  assert.deepEqual(result,{generation:1n,evidence:{state:"eligible",deploymentId:"release-one",activation:active}});
  assert.equal(f.clock,10400);assert.equal(f.reads,3);assert.equal(f.probes,2);
});
test("first cycle includes initial database read and first observation read",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock+=9000;};f.onRead=()=>{if(f.reads===2)f.clock+=1000;};
  await reason(readers,"OBSERVATION_EXPIRED");assert.equal(f.probes,1);
});
test("second cycle expires at its own ten-second boundary",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock+=f.probes===1?5200:HOSTED_OBSERVATION_BUDGET_MS;};
  await reason(readers,"OBSERVATION_EXPIRED");assert.equal(f.probes,2);
});
test("final database read cannot return expired second-cycle evidence",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock+=f.probes===1?5200:9000;};f.onRead=()=>{if(f.reads===3)f.clock+=1000;};
  await reason(readers,"OBSERVATION_EXPIRED");assert.equal(f.reads,3);
});
test("overall twenty-second boundary cannot return eligibility",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock=f.probes===1?9999:HOSTED_RECONCILIATION_BUDGET_MS;};
  await reason(readers,"OBSERVATION_EXPIRED");
});
test("clock reversal between cycles is denied even when still above original start",async()=>{
  const {f,readers}=fixture();f.onStatus=()=>{f.clock=f.probes===1?5200:5100;};
  await reason(readers,"OBSERVATION_EXPIRED");
});
test("invalid initial clock fails without contacting either authority",async()=>{
  const {f,readers}=fixture();f.clock=NaN;await reason(readers,"OBSERVATION_EXPIRED");
  assert.equal(f.reads,0);assert.equal(f.probes,0);
});
