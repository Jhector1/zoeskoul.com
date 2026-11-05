import type { DependencyLockBootstrapJobRequestV1,ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import {describe,expect,it} from "vitest";
import {resolveTrustedBuildOperation} from "./trustedBuildOperations.js";

const bootstrap:DependencyLockBootstrapJobRequestV1={protocolVersion:1,
  operation:"dependency-lock-bootstrap",buildProjectId:"project_1",sourceVersion:1,
  stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",files:[{path:"package.json",content:"{}"}]};
const production:ProductionBuildJobRequestV1={...bootstrap,operation:"production-build"};

describe("TanStack-only trusted Runner operation registry",()=>{
  it("owns one noninteractive dependency-lock bootstrap command",()=>{
    expect(resolveTrustedBuildOperation(bootstrap)).toEqual({operation:"dependency-lock-bootstrap",
      executorProfileId:"build-dependency-lock-bootstrap-v1",
      command:["pnpm","install","--lockfile-only","--ignore-scripts"],
      outputPaths:["pnpm-lock.yaml"],allowInteractive:false,allowShell:false,
      networkRequirement:"package-registry"});
  });
  it("registers server-owned Worker compilation without publishing",()=>{
    expect(resolveTrustedBuildOperation(production)).toEqual({
      operation:"production-build", executorProfileId:"build-production-tanstack-worker-v1",
      installCommand:["pnpm","install","--frozen-lockfile","--ignore-scripts"],
      buildCommand:["pnpm","exec","vite","build"],
      typecheckCommand:["pnpm","exec","tsc","--noEmit"],
      outputPaths:["dist/server","dist/client"], allowInteractive:false,
      allowShell:false, networkRequirement:"package-registry",
    });
  });
  it("rejects legacy identities for both operation types",()=>{
    expect(()=>resolveTrustedBuildOperation({...bootstrap,stackId:"react-vite-v1"})).toThrow();
    expect(()=>resolveTrustedBuildOperation({...production,templateId:"react-vite-v1"})).toThrow();
  });
});
