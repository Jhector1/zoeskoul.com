import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("K20D3F1 rootless node_modules ownership boundary", () => {
  it("prunes package trees while preparing mutable source files", () => {
    const code = readFileSync(fileURLToPath(new URL("./workspacePermissions.ts", import.meta.url)), "utf8");
    expect(code).toContain('"node_modules", "-prune"');
    expect(code).not.toContain('"chmod", ["-R"');
    expect(code).toContain('slice(0, 350)');
  });
});
