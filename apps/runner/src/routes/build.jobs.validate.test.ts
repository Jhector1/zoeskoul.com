import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = process.cwd();
function read(relative: string) { return readFileSync(resolve(repo, relative), "utf8"); }

describe("runner trusted Build validation route ownership", () => {
  it("parses the shared contract and resolves a runner-owned operation", () => {
    const source = read("src/routes/build.jobs.validate.ts");
    expect(source).toContain("parseTrustedBuildJobRequest(req.body)");
    expect(source).toContain("resolveTrustedBuildOperation(request)");
  });

  it("does not execute containers, shells, or package managers", () => {
    const source = read("src/routes/build.jobs.validate.ts").toLowerCase();
    for (const forbidden of ["docker", "startdockersession", "child_process", "spawn(", "exec(", "pnpm install", "/sessions/start"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is registered behind global service auth", () => {
    const app = read("src/app.ts");
    expect(app).toContain("app.use(requireServiceAuth)");
    expect(app).toContain('app.post("/build/jobs/validate", validateBuildJobRoute);');
  });
});
