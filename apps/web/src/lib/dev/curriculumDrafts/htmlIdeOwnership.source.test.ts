import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

describe("HTML IDE ownership", () => {
  it("keeps the browser implementation in learner-workspace", () => {
    const shared = read(
      "packages/learner-workspace/src/runner/components/WebPreview.tsx",
    );
    const output = read(
      "packages/learner-workspace/src/runner/components/OutputSurface.tsx",
    );

    expect(shared).toContain("<iframe");
    expect(output).toContain(
      "<WebPreview entries={model.entries} title={model.title} />",
    );
  });

  it("keeps Web's compatibility wrapper thin", () => {
    const rel =
      "apps/web/src/components/code/runner/components/WebPreview.tsx";

    if (!fs.existsSync(path.resolve(process.cwd(), rel))) return;

    const wrapper = read(rel);
    expect(wrapper).toContain(
      "@zoeskoul/learner-workspace/runner/components/WebPreview",
    );
    expect(wrapper).not.toContain("<iframe");
  });

  it("keeps Student on the same shared WebPreview owner", () => {
    const wrapperRel =
      "apps/student/src/legacy-web/components/code/runner/components/WebPreview.tsx";
    const testRel =
      "apps/student/src/legacy-web/components/code/runner/components/WebPreview.test.tsx";

    if (fs.existsSync(path.resolve(process.cwd(), wrapperRel))) {
      const wrapper = read(wrapperRel);
      expect(wrapper).toContain(
        "@zoeskoul/learner-workspace/runner/components/WebPreview",
      );
      expect(wrapper).not.toContain("<iframe");
      return;
    }

    const test = read(testRel);
    expect(test).toContain(
      "@zoeskoul/learner-workspace/runner/components/WebPreview",
    );
  });

  it("keeps Draft QA as data/profile adaptation rather than an IDE implementation", () => {
    const preview = read(
      "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
    );

    expect(preview).not.toContain("<iframe");
    expect(preview).not.toContain("Monaco");
    expect(preview).not.toContain("CodeToolPane");
  });

  it("keeps Web code enablement in learner-ui", () => {
    const policy = read("packages/learner-ui/src/lib/tools/policy.ts");

    expect(policy).toContain("CODE_WORKSPACE_PROFILES");
    expect(policy).toContain('"web"');
  });

  it("does not read unsupported solutionFiles from ManifestWorkspaceSeed", () => {
    const checks = read(
      "apps/web/src/lib/practice/generator/engines/json/recipes/sourceChecks.ts",
    );

    expect(checks).not.toContain("def.workspace?.solutionFiles");
  });
});
