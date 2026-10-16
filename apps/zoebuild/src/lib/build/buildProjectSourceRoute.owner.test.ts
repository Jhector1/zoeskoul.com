import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = resolve(
  ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
  "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/source/route.ts",
);

describe("ZoeBuild source-save HTTP boundary", () => {
  it("keeps transport/auth/rate/validation ahead of the mutation command", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("enforceSameOriginPost(req)");
    expect(source).toContain("exceedsContentLength(req, MAX_BUILD_SOURCE_BODY_BYTES)");
    expect(source).toContain("loadCurrentBuildAccessSnapshot()");
    expect(source).toContain('bucket: "zoebuild-source-save"');
    expect(source).toContain("parseBuildWorkspaceMutation(body.workspace)");
    expect(source).toContain("saveBuildProjectSourceCommand({");
    expect(source).toContain("createPrismaBuildProjectSourceWriter(prisma)");

    expect(source).not.toContain("prisma.codeProject.update");
    expect(source).not.toContain("prisma.codeProjectRevision.create");
  });

  it("exposes optimistic concurrency instead of last-write-wins", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("baseVersion");
    expect(source).toContain("BuildSourceConflictError");
    expect(source).toContain("409");
    expect(source).toContain("conflict: error.conflict");
  });

  it("does not introduce execution or provider calls", () => {
    const source = readFileSync(routePath, "utf8").toLowerCase();

    expect(source).not.toContain("cloudflare");
    expect(source).not.toContain("neon");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("docker");
    expect(source).not.toContain("openai");
    expect(source).not.toContain("judge0");
  });
});
