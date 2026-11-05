import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";

const edit = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", import.meta.url), "utf8");
const apply = edit.slice(edit.indexOf("export async function PATCH("));
const tanstackStart = apply.indexOf('if (project.stackId === "tanstack-start-v1")');
const retiredGate = apply.indexOf("// Retired stacks cannot reach the legacy save implementation below.");
const tanstackApply = apply.slice(tanstackStart, retiredGate);
const legacyApply = apply.slice(retiredGate);
const reviewedCommit = readFileSync(new URL("./zoeTanstackReviewedCommit.ts", import.meta.url), "utf8");

describe("V12K6 server-authoritative candidate compilation and edit-save gates", () => {
  it("keeps both TanStack and quarantined legacy saves behind source version and verification", () => {
    expect(tanstackStart).toBeGreaterThanOrEqual(0);
    expect(retiredGate).toBeGreaterThan(tanstackStart);
    expect(tanstackApply.indexOf("project.sourceVersion !== body.baseVersion"))
      .toBeLessThan(tanstackApply.indexOf("commitVerifiedTanstackReviewedEdit({"));
    expect(tanstackApply).toContain("verify:verifyTanstackWorkerEditCandidate");
    expect(tanstackApply).toContain("saveBuildProjectSourceCommand({");

    const validated = "const validatedEdits = validateZoeEdits(project.workspace, body.edits);";
    const applied = "const workspace = applyZoeEditsToWorkspace(project.workspace, validatedEdits);";
    const verified = "const verification = await verifyZoeReactCandidateAtRunner";
    const saved = "const saved = await saveBuildProjectSourceCommand";
    expect(legacyApply.indexOf(validated)).toBeGreaterThanOrEqual(0);
    expect(legacyApply.indexOf(validated)).toBeLessThan(legacyApply.indexOf(applied));
    expect(legacyApply.indexOf(applied)).toBeLessThan(legacyApply.indexOf(verified));
    expect(legacyApply.indexOf(verified)).toBeLessThan(legacyApply.indexOf(saved));
  });

  it("treats browser edits as unknown until the TanStack helper validates and assembles them", () => {
    // The route intentionally passes untrusted `body.edits` to an `unknown` port.
    // That port validates BEFORE invoking Runner, rather than trusting a route cast.
    expect(tanstackApply).toContain("edits:body.edits, specification:project.specification,");
    expect(reviewedCommit).toContain("edits:unknown;");
    const validated = "const validatedEdits = validateZoeEdits(input.workspace, input.edits);";
    const candidate = "const candidate = applyZoeEditsToWorkspace(input.workspace, validatedEdits);";
    const verified = "const verification = await dependencies.verify({";
    const saved = "await dependencies.persist({workspace:candidate,baseVersion:input.baseVersion})";
    expect(reviewedCommit).toContain(validated);
    expect(reviewedCommit).toContain(candidate);
    expect(reviewedCommit).toContain("edits:validatedEdits,");
    expect(reviewedCommit.indexOf(validated)).toBeLessThan(reviewedCommit.indexOf(candidate));
    expect(reviewedCommit.indexOf(candidate)).toBeLessThan(reviewedCommit.indexOf(verified));
    expect(reviewedCommit.indexOf(verified)).toBeLessThan(reviewedCommit.indexOf(saved));
    expect(reviewedCommit).not.toContain("edits:input.edits,");
    // Old React branch continues to pass only its validated edits to Runner.
    expect(legacyApply).toContain("edits:validatedEdits, specification:project.specification,");
    expect(legacyApply).not.toContain("edits:body.edits, specification:project.specification,");
    expect(legacyApply).not.toContain("as readonly ZoeSourceEdit[]");
  });

  it("never uses a browser verification claim or a billable model during reviewed-source saving", () => {
    expect(tanstackApply).toContain('code:"BUILD_EDIT_BUILD_NOT_VERIFIED"');
    expect(reviewedCommit).toContain('verification.state !== "passed"');
    expect(reviewedCommit).toContain('verification.sourceVersion !== input.sourceVersion');
    expect(reviewedCommit).toContain('verification.verificationId !== input.verificationId');
    expect(reviewedCommit).toContain('verification.artifactSha256');
    expect(legacyApply).toContain('sourceKind:"candidate", correlationId:requestId');
    expect(legacyApply).toContain('if (verification.state !== "passed")');
    expect(apply).not.toContain("body.buildVerification");
    expect(apply).not.toContain("generateJsonText(");
  });
});
