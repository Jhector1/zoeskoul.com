import { describe, expect, it } from "vitest";
import { BuildPreparationError, assertRegisteredProductionBuildFiles } from "./index";
import { fresh } from "./tanstackTestFixtures";

describe("legacy static builder is closed during the Worker cutover",()=>{
  it("does not execute TanStack Worker output through static-dist builder",()=>{
    expect(()=>assertRegisteredProductionBuildFiles({stackId:"tanstack-start-v1",
      templateId:"tanstack-start-v1",files:[]})).toThrow(BuildPreparationError);
  });
  it("does not revive unsupported React or static stacks",()=>{
    for(const stackId of ["react-vite-v1","static-html-v1"])
      expect(()=>assertRegisteredProductionBuildFiles({stackId,templateId:stackId,files:[]}))
        .toThrow(BuildPreparationError);
    expect(fresh().nodes.length).toBeGreaterThan(0);
  });
});
