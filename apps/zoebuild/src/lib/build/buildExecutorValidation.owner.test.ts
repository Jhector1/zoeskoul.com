import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild trusted executor client ownership", () => {
  it("reuses canonical runnerPost for validation and restricted bootstrap execution", () => {
    const source = read("./buildExecutorValidation.ts");

    expect(source).toContain('import "server-only"');
    expect(source).toContain("runnerPost<TrustedBuildJobValidationResponse>");
    expect(source).toContain('"/build/jobs/validate"');
    expect(source).toContain(
      "runnerPost<DependencyLockBootstrapExecutionResponseV1>",
    );
    expect(source).toContain('"/build/jobs/dependency-lock-bootstrap"');

    expect(source).toContain(
      "runnerPost<\n    ProductionBuildExecutionResponseV1\n  >",
    );
    expect(source).toContain(
      '"/build/jobs/production-build"',
    );

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("Docker");
  });

  it("adds no browser/public API trigger in V300J", () => {
    const source = read("./buildExecutorValidation.ts");

    expect(source).toContain("server-only");
    expect(source).not.toContain("NextResponse");
  });
});
