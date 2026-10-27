import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL(
  "../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts",
  import.meta.url,
), "utf8");

describe("V12K10E React project-agent entry gate", () => {
  it("does not reject generic React edits because their legacy preselected file list is empty", () => {
    expect(routeSource).toContain("const files = isReactProject ? [] : listZoeEditableFiles(");
    expect(routeSource).toContain("if (!isReactProject && !pagePath && !selected.length) return result(");
    expect(routeSource).not.toContain("if (!pagePath && !selected.length) return result(");
    expect(routeSource).toContain("const agentOutput = isReactProject ? await runZoeProjectAgent(");
  });

  it("continues rejecting generic static editing without selected source", () => {
    // The original no-files response remains, but only for the legacy static path.
    expect(routeSource).toContain('code: "BUILD_EDIT_NO_FILES"');
    expect(routeSource).toContain("if (!isReactProject && !pagePath && !selected.length) return result(");
    expect(routeSource).toContain('const files = isReactProject ? [] : listZoeEditableFiles(');
  });

  it("retains owner authorization, snapshot version check and isolated React build", () => {
    expect(routeSource).toContain("resolveBuildAccess(access).canEditWithAi");
    expect(routeSource).toContain("project.sourceVersion !== baseVersion");
    expect(routeSource).toContain("validateZoeEdits(project.workspace,");
    expect(routeSource).toContain("verifyZoeReactCandidateAtRunner({");
  });
});
