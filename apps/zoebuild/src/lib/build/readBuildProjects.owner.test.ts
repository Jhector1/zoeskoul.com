import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("ZoeBuild read persistence ownership", () => {
  it("keeps CodeProject.ownerId authoritative for Build list and detail", () => {
    const source = read("./readBuildProjects.ts");

    expect(source).toContain("client.buildProject.findMany");
    expect(source).toContain("client.buildProject.findFirst");
    expect(source).toContain("codeProject: {");
    expect(source).toContain("ownerId: userId");
    expect(source).toContain("archivedAt: null");
    expect(source).not.toContain("grants:");
    expect(source).not.toContain("actorKey");
  });

  it("keeps the adapter provider-neutral and validates stored lifecycle/spec data", () => {
    const source = read("./readBuildProjects.ts").toLowerCase();

    expect(source).toContain("isbuildprojectlifecyclestatus");
    expect(source).toContain("parseprojectspecification");
    expect(source).not.toContain("cloudflare");
    expect(source).not.toContain("neon");
    expect(source).not.toContain("stripe");
    expect(source).not.toContain("docker");
    expect(source).not.toContain("openai");
  });
});
