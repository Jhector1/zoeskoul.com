import { describe, expect, it } from "vitest";
import { BuildPreparationError,resolveRegisteredReactPreviewServerPlan } from "./index";

describe("retired SPA preview execution is unavailable",()=>{
  it("rejects the old React preview and the TanStack Worker identity",()=>{
    for(const stackId of ["react-vite-v1","static-html-v1","tanstack-start-v1"])
      expect(()=>resolveRegisteredReactPreviewServerPlan({stackId,templateId:stackId}))
        .toThrow(BuildPreparationError);
  });
});
