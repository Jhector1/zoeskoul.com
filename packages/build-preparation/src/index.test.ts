import { describe, expect, it } from "vitest";
import { BuildPreparationError, prepareRegisteredBuildArtifactPlan } from "./index";
import { fresh, withLock, specification, projectId } from "./tanstackTestFixtures";

describe("canonical TanStack artifact preparation",()=>{
  it("prepares dependency bootstrap without an unsigned build",()=>{
    const plan=prepareRegisteredBuildArtifactPlan({buildProjectId:projectId,
      specification,workspace:fresh(),sourceVersion:1});
    expect(plan).toMatchObject({stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
      deploymentAdapterId:"cloudflare-workers-v1",buildReady:false,
      dependencyLock:{state:"bootstrap-required",manager:"pnpm",path:"pnpm-lock.yaml"},
      artifact:{type:"worker-bundle",outputPath:"dist/server",assetsPath:"dist/client",entrypoint:"index.js"}});
  });
  it("detects a present lock but leaves execution approval to the signed request gate",()=>{
    const plan=prepareRegisteredBuildArtifactPlan({buildProjectId:projectId,
      specification,workspace:withLock(),sourceVersion:2});
    expect(plan.dependencyLock.state).toBe("present");
    expect(plan.buildReady).toBe(true);
  });
  it("rejects retired stack registrations and empty locks",()=>{
    expect(()=>prepareRegisteredBuildArtifactPlan({buildProjectId:projectId,
      specification:{...specification,stackId:"react-vite-v1"},workspace:fresh(),sourceVersion:1}))
      .toThrow(BuildPreparationError);
    expect(()=>prepareRegisteredBuildArtifactPlan({buildProjectId:projectId,
      specification,workspace:withLock(fresh(),"   "),sourceVersion:2})).toThrow(BuildPreparationError);
  });
});
