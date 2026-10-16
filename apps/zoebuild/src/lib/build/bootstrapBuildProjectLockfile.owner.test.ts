import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const filePath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/lib/build/bootstrapBuildProjectLockfile.ts",
);

describe("ZoeBuild dependency-lock orchestration ownership", () => {
  it("reuses owner-scoped read and the canonical source-save command", () => {
    const source = readFileSync(filePath, "utf8");

    expect(source).toContain("getBuildProjectCommand({");
    expect(source).toContain("createRegisteredDependencyLockBootstrapJob({");
    expect(source).toContain("applyDependencyLockBootstrapExecution({");
    expect(source).toContain("saveBuildProjectSourceCommand({");
    expect(source).toContain("baseVersion: project.sourceVersion");

    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("codeProject.update");
    expect(source).not.toContain("codeProjectRevision.create");
  });

  it("executes before persistence and preserves optimistic concurrency", () => {
    const source = readFileSync(filePath, "utf8");
    const executeAt = source.indexOf("execution = await input.execute");
    const saveAt = source.indexOf("saveBuildProjectSourceCommand({");

    expect(executeAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(executeAt);
    expect(source).toContain("baseVersion: project.sourceVersion");
  });
});
