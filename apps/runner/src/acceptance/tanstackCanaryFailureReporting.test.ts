import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("operator canary failure reporting", () => {
  const source = readFileSync(resolve(process.cwd(), "src/acceptance/tanstackCanary.ts"), "utf8");

  it("preserves the original install exception and reports cleanup independently", () => {
    expect(source).toContain("primaryFailure = error;");
    expect(source).toContain("throw error;");
    expect(source).toContain('console.error("P3B3_OPERATOR_CLEANUP_INCOMPLETE"');
    expect(source).toContain('cleanupFailures.push("sandbox-workspaces")');
  });

  it("checks every resource class even after a prior cleanup operation fails", () => {
    for (const step of ["preview-stop", "bootstrap-workspace", "sandbox-containers",
      "container-inspection", "sandbox-workspaces", "workspace-inspection", "preview-leases"]) {
      expect(source).toContain(step);
    }
  });
});
