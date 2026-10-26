import { describe, expect, it } from "vitest";
import { classifyProductionBuildStepFailure, TrustedProductionBuildStepFailure } from "./productionBuildStepFailure.js";

describe("V12K6 sanitized production-build diagnostics", () => {
  it("treats actual compiler nonzero exit as a rejected build, not runner outage", () => {
    expect(classifyProductionBuildStepFailure(new TrustedProductionBuildStepFailure("build", "nonzero-exit")))
      .toMatchObject({status:422,code:"BUILD_COMPILATION_REJECTED",stage:"build"});
  });
  it("does not mislabel package install failure as source compilation", () => {
    expect(classifyProductionBuildStepFailure(new TrustedProductionBuildStepFailure("install", "nonzero-exit")))
      .toMatchObject({status:502,code:"BUILD_DEPENDENCY_INSTALL_FAILED",stage:"install"});
  });
  it("reports each step timeout without claiming compilation was checked", () => {
    for (const stage of ["install", "build"] as const) {
      expect(classifyProductionBuildStepFailure(new TrustedProductionBuildStepFailure(stage,"timeout")))
        .toMatchObject({status:504,code:"BUILD_RUNNER_STEP_TIMEOUT",stage});
    }
  });
  it("returns only sanitized values, never private error messages", () => {
    const result=classifyProductionBuildStepFailure(new TrustedProductionBuildStepFailure("build","nonzero-exit"));
    expect(JSON.stringify(result)).not.toContain("stdout");
    expect(JSON.stringify(result)).not.toContain("stderr");
    expect(classifyProductionBuildStepFailure(new Error("private secret token"))).toBeNull();
  });
});
