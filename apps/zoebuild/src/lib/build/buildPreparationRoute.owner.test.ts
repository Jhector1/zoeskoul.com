import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/preparation/route.ts",
);

describe("ZoeBuild preparation HTTP boundary", () => {
  it("loads source through the owner-scoped Build read command", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("loadCurrentBuildAccessSnapshot()");
    expect(source).toContain("getBuildProjectCommand({");
    expect(source).toContain("createPrismaBuildProjectReader(prisma)");
    expect(source).toContain("prepareRegisteredBuildArtifactPlan({");

    expect(source).not.toContain("prisma.buildProject.find");
    expect(source).not.toContain("prisma.codeProject.find");
  });

  it("is planning-only and exposes no execution mutation", () => {
    const source = readFileSync(routePath, "utf8").toLowerCase();

    expect(source).toContain("export async function get");
    expect(source).not.toContain("export async function post");
    expect(source).not.toContain("export async function patch");
    expect(source).not.toContain("export async function delete");

    for (const forbidden of [
      "docker",
      "judge0",
      "child_process",
      "spawn(",
      "exec(",
      "cloudflare",
      "neon",
      "stripe",
      "openai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
