import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const route = readFileSync(fileURLToPath(new URL(
  "../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",
  import.meta.url
)), "utf8");

describe("V12K11M one isolated build at apply, not twice per AI proposal", () => {
  const proposalStart = route.indexOf("const makeProposal = async (");
  const proposalEnd = route.indexOf("if (!wantsStream)", proposalStart);
  const applyStart = route.indexOf("const validatedEdits = validateZoeEdits(", proposalEnd);
  const saveStart = route.indexOf("const saved = await saveBuildProjectSourceCommand(", applyStart);

  it("proposal is canonical in-memory staged only", () => {
    expect(proposalStart).toBeGreaterThan(0);
    expect(proposalEnd).toBeGreaterThan(proposalStart);
    const proposal = route.slice(proposalStart, proposalEnd);
    expect(proposal).toContain("applyZoeEditsToWorkspace(project.workspace, edits)");
    expect(proposal).toContain("previewZoeEdits(");
    expect(proposal).not.toContain("verifyZoeReactCandidateAtRunner({");
    expect(proposal).not.toContain("saveBuildProjectSourceCommand(");
  });
  it("apply validates and recompiles the current authorized candidate before save", () => {
    expect(applyStart).toBeGreaterThan(proposalEnd);
    expect(saveStart).toBeGreaterThan(applyStart);
    const apply = route.slice(applyStart, saveStart);
    expect(apply).toContain("applyZoeEditsToWorkspace(project.workspace, validatedEdits)");
    expect(apply).toContain("verifyZoeReactCandidateAtRunner({");
    expect(apply).toContain('if (verification.state !== "passed")');
    expect(apply).toContain("capacitySource: verification.capacitySource");
  });
  it("one build call in edit route and no blind claim of verification", () => {
    expect(route.match(/verifyZoeReactCandidateAtRunner\(\{/g)).toHaveLength(1);
    expect(route).toContain("Isolated build will run before saving");
    expect(route).not.toContain('phase: "build_verification"');
  });
});
