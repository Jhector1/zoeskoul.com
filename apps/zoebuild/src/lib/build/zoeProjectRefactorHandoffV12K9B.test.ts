import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const intentRoute = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts", import.meta.url), "utf8");
const editRoute = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts", import.meta.url), "utf8");

// These contracts protect the model handoff, not the actual model's future choices.
describe("V12K9B semantic architecture handoff", () => {
  it("classifies meaningful project-wide refactors as edits rather than demanding a new design", () => {
    expect(intentRoute).toContain("project-wide code refactor is action=edit with pagePath=none");
    expect(intentRoute).toContain("refactor shared UI");
    expect(intentRoute).toContain("Do not ask for visual changes when the user explicitly wants the current appearance preserved");
    expect(intentRoute).toContain("Infer that distinction from meaning and project context, never isolated command words");
  });
  it("asks the edit model to extract shared UI when source evidence is sufficient", () => {
    expect(editRoute).toContain("When the evidence shows independent header/nav/footer copies");
    expect(editRoute).toContain("update importing pages in the same proposal");
    expect(editRoute).toContain("explain the specific missing evidence or hard limitation");
    expect(editRoute).toContain("selectZoeReactDesignEvidence");
  });
  it("keeps model output advisory and current guarded build/save authority", () => {
    expect(editRoute).toContain("validateZoeEdits(project.workspace");
    expect(editRoute).toContain("verifyZoeReactCandidateAtRunner");
    expect(editRoute).toContain("saveBuildProjectSourceCommand");
    expect(intentRoute).toContain("loadCurrentBuildAccessSnapshot(req, {requireAuthority:true})");
  });
});
