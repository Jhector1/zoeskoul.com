import {describe,expect,it} from "vitest";
import {parseTrustedBuildJobRequest} from "@zoeskoul/build-executor-contracts";
import {BuildPreparationError,createRegisteredDependencyLockBootstrapJob} from "./index";
import {fresh,projectId,specification} from "./tanstackTestFixtures";

describe("TanStack-only dependency bootstrap handoff",()=>{
  it("creates a shell-free registered lock-resolution job",()=>{
    const job=createRegisteredDependencyLockBootstrapJob({buildProjectId:projectId,
      specification,workspace:fresh(),sourceVersion:1});
    expect(parseTrustedBuildJobRequest(job)).toEqual(job);
    expect(job).toMatchObject({operation:"dependency-lock-bootstrap",stackId:"tanstack-start-v1",
      templateId:"tanstack-start-v1",buildProjectId:projectId});
    for(const key of ["command","argv","shell","cwd","env","network"])
      expect((job as unknown as Record<string,unknown>)[key]).toBeUndefined();
  });
  it("rejects retired framework identifiers",()=>{
    expect(()=>createRegisteredDependencyLockBootstrapJob({buildProjectId:projectId,
      specification:{...specification,stackId:"react-vite-v1"},workspace:fresh(),sourceVersion:1}))
      .toThrow(BuildPreparationError);
  });
});
