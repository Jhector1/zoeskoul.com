import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/route.ts",
);

describe("ZoeBuild project-detail HTTP boundary", () => {
  it("authorizes before owner-scoped persistence and returns 404 for missing access", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("loadCurrentBuildAccessSnapshot()");
    expect(source).toContain("getBuildProjectCommand({");
    expect(source).toContain("createPrismaBuildProjectReader(prisma)");
    expect(source).toContain('"BUILD_PROJECT_NOT_FOUND"');
    expect(source).not.toContain("prisma.buildProject.findFirst");
    expect(source).not.toContain("prisma.codeProject.find");
  });

  it("is read-only in V300F", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("export async function GET");
    expect(source).not.toContain("export async function PATCH");
    expect(source).not.toContain("export async function POST");
    expect(source).not.toContain("export async function DELETE");
  });
});
