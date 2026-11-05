import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts", import.meta.url), "utf8");
const preview = readFileSync(new URL("./reactPreviewServer.ts", import.meta.url), "utf8");
const classifier = readFileSync(new URL("./reactPreviewDependencyRecovery.ts", import.meta.url), "utf8");

describe("P3B7E5A trusted TanStack one-time dependency preparation", () => {
  it("matches the exact TanStack bootstrap-required response", () => {
    expect(preview).toContain('"TanStack preview requires one-time trusted dependency preparation."');
    expect(classifier).toContain('"TanStack preview requires one-time trusted dependency preparation."');
    expect(classifier).not.toContain('"React preview requires one-time trusted dependency preparation."');
  });
  it("permits only registered TanStack projects for automatic bootstrap", () => {
    expect(route).toContain('saved.stackId !== "tanstack-start-v1"');
    expect(route).toContain('saved.specification?.stackId !== "tanstack-start-v1"');
    expect(route).not.toContain('saved.stackId !== "react-vite-v1"');
  });
  it("retains authenticated, saved-source CAS and non-user-selected runner execution", () => {
    for (const required of [
      'enforceSameOriginPost(req)', 'loadCurrentBuildAccessSnapshot()',
      'requireRunnerActorKey(userId)', 'saved.sourceVersion !== baseVersion',
      'inspectProjectOwnedDependencyPreparation({',
      'approveRestoredDependencyRepair || options.desiredDependencies !== undefined',
      'createPrismaBuildProjectSourceWriter(prisma, {createRevision:false})',
      'execute: executeTrustedDependencyLockBootstrapAtRunner',
    ]) expect(route).toContain(required);
  });
});
