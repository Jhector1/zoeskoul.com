import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild source-write persistence ownership", () => {
  it("owner-scopes BuildProject and reuses the canonical CodeProject writer", () => {
    const source = read("./saveBuildProjectSource.ts");

    expect(source).toContain("client.$transaction(async (tx) =>");
    expect(source).toContain("tx.buildProject.findFirst");
    expect(source).toContain("ownerId: userId");
    expect(source).toContain("archivedAt: null");
    expect(source).toContain("saveCodeProjectInTransaction(tx");
    // Ordinary manual source saves retain canonical history by default.
    // Only the narrowly scoped history switch/auto-recovery callers opt out.
    expect(source).toContain("options: Readonly<{createRevision?:boolean}> = {}");
    expect(source).toContain("createRevision: options.createRevision ?? true");
    expect(source).toContain("baseVersion: input.baseVersion");

    expect(source).not.toContain("tx.codeProject.update");
    expect(source).not.toContain("tx.codeProjectRevision.create");
  });

  it("maps canonical project conflicts into the Build domain", () => {
    const source = read("./saveBuildProjectSource.ts");

    expect(source).toContain("error instanceof ProjectVersionConflictError");
    expect(source).toContain("new BuildSourceConflictError");
  });
});
