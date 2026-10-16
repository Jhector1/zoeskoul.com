import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = process.cwd();

function read(relative: string) {
  return readFileSync(resolve(repo, relative), "utf8");
}

describe("restricted Build bootstrap route ownership", () => {
  it("parses the shared contract before calling the one trusted executor", () => {
    const source = read("src/routes/build.jobs.dependencyLockBootstrap.ts");

    expect(source).toContain("parseTrustedBuildJobRequest(req.body)");
    expect(source).toContain("executeDependencyLockBootstrap(request)");
    expect(source).not.toContain("createContainer(");
  });

  it("is registered after global service authentication", () => {
    const app = read("src/app.ts");
    const auth = app.indexOf("app.use(requireServiceAuth)");
    const route = app.indexOf(
      'app.post("/build/jobs/dependency-lock-bootstrap", executeBuildDependencyLockBootstrapRoute);',
    );

    expect(auth).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(auth);
  });

  it("does not introduce a PTY or terminal execution boundary", () => {
    const source = read("src/routes/build.jobs.dependencyLockBootstrap.ts").toLowerCase();

    expect(source).not.toContain("pty");
    expect(source).not.toContain("/sessions/start");
    expect(source).not.toContain("websocket");
    expect(source).not.toContain("shell");
  });
});
