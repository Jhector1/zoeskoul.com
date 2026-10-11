import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

function source(rel: string) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("HTML expected result ownership", () => {
  it("builds the reference from authored solutionFiles", () => {
    const recipe = source(
      "apps/web/src/lib/practice/generator/engines/json/recipes/sourceChecks.ts",
    );

    expect(recipe).toContain('kind: "web_preview"');
    expect(recipe).toContain("files: solutionFiles");
    expect(recipe).toContain("expectedExample: expectedWebPreview");
  });

  it("renders through the shared learner-workspace WebPreview", () => {
    const ui = source(
      "packages/learner-workspace/src/components/practice/kinds/CodeInputExerciseUI.tsx",
    );

    expect(ui).toContain(
      'import WebPreview from "../../../runner/components/WebPreview"',
    );
    expect(ui).toContain('webExample?.kind === "web_preview"');
    expect(ui).toContain('data-testid="web-expected-result"');
    expect(ui).toContain("<WebPreview");
    expect(ui).not.toContain("<iframe");
  });

  it("keeps entry-path ownership in the shared WebPreview", () => {
    const preview = source(
      "packages/learner-workspace/src/runner/components/WebPreview.tsx",
    );

    expect(preview).toContain("entryPath?: string");
    expect(preview).toContain('normalizePath(props.entryPath ?? "")');
    expect(preview).toContain("buildWebPreviewSrcDoc(props.entries, virtualPath)");
  });

  it("does not add screenshot-based expected-result ownership", () => {
    const recipe = source(
      "apps/web/src/lib/practice/generator/engines/json/recipes/sourceChecks.ts",
    );
    const ui = source(
      "packages/learner-workspace/src/components/practice/kinds/CodeInputExerciseUI.tsx",
    );

    expect(`${recipe}\n${ui}`.toLowerCase()).not.toContain("expectedresultscreenshot");
  });
});
