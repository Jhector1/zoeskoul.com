import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

// Route wiring regression: restoring an existing database snapshot must use the
// canonical saved-source runner verifier. AI candidate mode disallows [] edits.
const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/source-history/route.ts", import.meta.url), "utf8");
const restoreCall = route.match(/const verification = await verifyZoeReactCandidateAtRunner\(\{([\s\S]*?)\n    \}\);/)?.[1] ?? "";

describe("V12K8B historical source restore verifier wiring", () => {
  it("verifies an owner-loaded historical snapshot with empty edits using saved-source mode", () => {
    expect(restoreCall).toContain("workspace,edits:[],specification:project.specification");
    expect(restoreCall).toContain('sourceKind:"saved"');
    expect(restoreCall).not.toContain('sourceKind:"candidate"');
  });
  it("checks the exact base version before build verification and uses CAS when saving", () => {
    const currentGate = route.indexOf("project.sourceVersion !== restore.baseVersion");
    const build = route.indexOf("const verification = await verifyZoeReactCandidateAtRunner(");
    const save = route.indexOf("const saved = await saveBuildProjectSourceCommand(");
    expect(currentGate).toBeGreaterThan(0);
    expect(currentGate).toBeLessThan(build);
    expect(build).toBeLessThan(save);
    expect(route).toContain("baseVersion:project.sourceVersion");
  });
  it("requires a passing runner build and keeps restore source server-owned", () => {
    expect(route).toContain('verification.state !== "passed"');
    expect(route).toContain('code:"BUILD_RESTORE_BUILD_NOT_VERIFIED"');
    expect(route.indexOf('verification.state !== "passed"')).toBeLessThan(route.indexOf("const saved = await saveBuildProjectSourceCommand("));
    expect(route).toContain("parseBuildWorkspaceMutation(revision.snapshot)");
    expect(route).not.toContain("decoded.workspace");
  });
});
