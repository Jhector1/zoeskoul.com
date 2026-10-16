import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routePath = fileURLToPath(
  new URL(
    "../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts",
    import.meta.url,
  ),
);

describe("owner-authorized dependency-lock bootstrap HTTP boundary", () => {
  it("keeps same-origin, account auth, rate limit, runner actor identity, and owner orchestration ahead of execution", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("enforceSameOriginPost(req)");
    expect(source).toContain("loadCurrentBuildAccessSnapshot()");
    expect(source).toContain('bucket: "zoebuild-lock-bootstrap"');
    expect(source).toContain("requireRunnerActorKey(userId)");
    expect(source).toContain("bootstrapOwnedBuildProjectDependencyLock({");
    expect(source).toContain("createPrismaBuildProjectReader(prisma)");
    expect(source).toContain("createPrismaBuildProjectSourceWriter(prisma)");
    expect(source).toContain("executeTrustedDependencyLockBootstrapAtRunner");

    expect(source).not.toContain("createContainer(");
    expect(source).not.toContain("prisma.codeProject.update");
    expect(source).not.toContain("prisma.codeProjectRevision.create");
  });

  it("returns optimistic source conflicts as HTTP 409", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("error instanceof BuildSourceConflictError");
    expect(source).toContain("conflict: error.conflict");
    expect(source).toContain("409");
  });

  it("does not accept command, argv, shell, image, env, or network options from the browser", () => {
    const source = readFileSync(routePath, "utf8").toLowerCase();

    for (const forbidden of [
      "body.command",
      "body.argv",
      "body.shell",
      "body.image",
      "body.env",
      "body.network",
      "readjsonsafe",
      "req.json",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
