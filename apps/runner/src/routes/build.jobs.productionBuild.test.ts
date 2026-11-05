import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("trusted TanStack Worker compilation route", () => {
  it("parses the executor contract and rejects non-Worker requests before capacity admission", () => {
    const route = read("src/routes/build.jobs.productionBuild.ts");
    expect(route).toContain("parseTrustedBuildJobRequest");
    expect(route).toContain('"production-build"');
    expect(route.indexOf("assertTanstackWorkerBuildRequest(request)"))
      .toBeLessThan(route.indexOf("withZoeBuildBuildSlot("));
    expect(route).toContain("executeTanstackWorkerBuild(request)");
    expect(route).toContain(".json({ ok: true, result });");
    expect(route).not.toContain("executeProductionBuild(");
    expect(route).not.toContain("createContainer(");
  });
  it("remains behind global service authentication and isolated from Learning pool", () => {
    const app = read("src/app.ts");
    const auth = app.indexOf("app.use(requireServiceAuth)");
    const route = app.indexOf('app.post("/build/jobs/production-build", executeBuildProductionRoute);');
    expect(auth).toBeGreaterThan(-1);
    expect(route).toBeGreaterThan(auth);
    const guard = read("src/middleware/executionPoolGuard.ts");
    expect(guard).toContain('if (pool === "zoebuild")');
    expect(guard).toContain('return path.startsWith("/sessions/")');
  });
  it("does not allow PTY, shell, raw commands or browser-controlled execution", () => {
    const route = read("src/routes/build.jobs.productionBuild.ts").toLowerCase();
    for (const forbidden of ["child_process", "websocket", "pty", "createcontainer(", "request.command", "/sessions/start"]) {
      expect(route).not.toContain(forbidden);
    }
  });
});
