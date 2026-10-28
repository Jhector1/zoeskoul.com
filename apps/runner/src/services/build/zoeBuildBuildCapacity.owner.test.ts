import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const production = readFileSync(
  new URL("../../routes/build.jobs.productionBuild.ts", import.meta.url), "utf8",
);
const bootstrap = readFileSync(
  new URL("../../routes/build.jobs.dependencyLockBootstrap.ts", import.meta.url), "utf8",
);
const sessions = readFileSync(
  new URL("../../routes/sessions.start.ts", import.meta.url), "utf8",
);

describe("ZoeBuild shared-runner build admission ownership", () => {
  it("covers both one-shot operations through the same slot owner", () => {
    expect(production).toContain("withZoeBuildBuildSlot(() => executeProductionBuild(request))");
    expect(bootstrap).toContain("withZoeBuildQueuedBootstrapSlot(");
    expect(bootstrap).toContain("requestKey, () => executeDependencyLockBootstrap(request)");
    expect(bootstrap).toContain("getRequiredActorKey(req)");
  });

  it("translates capacity refusal to 429 at both trusted routes", () => {
    for (const source of [production, bootstrap]) {
      expect(source).toContain("error instanceof ZoeBuildBuildCapacityError");
      expect(source).toContain(".status(429)");
    }
  });

  it("does not wrap the student learning session route", () => {
    expect(sessions).not.toContain("withZoeBuildBuildSlot");
    expect(sessions).not.toContain("ZoeBuildBuildCapacityError");
  });
});
