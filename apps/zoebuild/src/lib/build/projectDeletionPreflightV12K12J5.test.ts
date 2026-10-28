import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("./deleteOwnedBuildProject.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/route.ts", import.meta.url), "utf8");

describe("V12K12J5 safe deletion preflight and diagnostics", () => {
  it("checks all safety blockers before touching runner previews", () => {
    const preflight = route.indexOf("await preflightOwnedBuildProjectDeletion(prisma, deletionInput)");
    const drain = route.indexOf("await drainTrustedReactProjectPreviewsAtRunner(");
    const deletion = route.indexOf("await deleteOwnedBuildProject(prisma, deletionInput)");
    expect(preflight).toBeGreaterThan(0);
    expect(drain).toBeGreaterThan(preflight);
    expect(deletion).toBeGreaterThan(drain);
    expect(route).toContain('stage = "runner"');
    expect(route).toContain('stage = "database"');
  });
  it("runs the same safety evaluator twice and retains Serializable final deletion", () => {
    expect(service).toContain("export async function preflightOwnedBuildProjectDeletion(");
    expect(service).toContain("async function assessOwnedBuildProjectDeletion(");
    expect(service.match(/await assessOwnedBuildProjectDeletion\(tx, input\)/g)).toHaveLength(2);
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("codeProject.deleteMany");
    expect(service).not.toContain("aiCreditLedger.delete");
  });
  it("reports distinct safe error codes for runner, database and blocker failures", () => {
    for (const code of [
      "BUILD_DELETE_RUNNER_UNAVAILABLE", "BUILD_DELETE_DATABASE_UNAVAILABLE",
      "BUILD_DELETE_PREFLIGHT_UNAVAILABLE", "BUILD_DELETE_ORDERS_PRESENT",
      "BUILD_DELETE_EXTERNAL_CONNECTIONS", "BUILD_DELETE_EXTERNAL_RESOURCES", "BUILD_DELETE_ACTIVE_WORK",
    ]) expect(route).toContain(code);
    expect(route).toContain("releaseTrustedReactProjectPreviewDrainAtRunner");
  });
});
