import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  import.meta.dirname,
  "../../..",
);

describe("runner production workspace TypeScript boundary", () => {
  it("loads compiled runner output with the tsx runtime loader", () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "apps/runner/package.json"),
        "utf8",
      ),
    );

    expect(pkg.scripts.start).toBe(
      "node --import=tsx dist/server.js",
    );
    expect(pkg.scripts["smoke:runtime"]).toBe(
      "node --import=tsx dist/runtimeWorkspaceSmoke.js",
    );
    expect(pkg.scripts.postbuild).toBe(
      "pnpm run smoke:runtime",
    );
    expect(pkg.dependencies.tsx).toBeTruthy();
    expect(pkg.devDependencies?.tsx).toBeUndefined();
  });

  it("smokes the exact shared package that crashed on the VM", () => {
    const smoke = fs.readFileSync(
      path.join(
        repoRoot,
        "apps/runner/src/runtimeWorkspaceSmoke.ts",
      ),
      "utf8",
    );

    expect(smoke).toContain(
      'from "@zoeskoul/build-preparation"',
    );
    expect(smoke).toContain(
      "new BuildPreparationError(",
    );
    expect(smoke).toContain(
      "runner_workspace_typescript_runtime=PASS",
    );
  });
});
