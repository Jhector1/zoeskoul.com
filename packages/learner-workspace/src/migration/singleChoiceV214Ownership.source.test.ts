import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V214 SingleChoice shared ownership", () => {
  it("exports SingleChoice from learner-workspace", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/kinds/SingleChoiceExerciseUI"]).toBe(
      "./src/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );
  });

  it("keeps app i18n in thin Student/Web adapters", () => {
    const student = source(
      "apps/student/src/legacy-web/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );
    const web = source(
      "apps/web/src/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );

    expect(student).toContain("@zoeskoul/learner-workspace/components/practice/kinds/SingleChoiceExerciseUI");
    expect(web).toContain("@zoeskoul/learner-workspace/components/practice/kinds/SingleChoiceExerciseUI");

    expect(student).toContain(
      'from "@student/i18n/tagged"',
    );
    expect(web).toContain(
      'from "@/i18n/tagged"',
    );

    expect(student).toContain(
      'useTaggedT("practiceUi.singleChoice")',
    );
    expect(web).toContain(
      'useTaggedT("practiceUi.singleChoice")',
    );

    expect(student).toContain(
      'ui.t("chooseOne", {}, "Choose one")',
    );
    expect(web).toContain(
      'ui.t("chooseOne", {}, "Choose one")',
    );

    expect(student).toContain("ExercisePromptProvider");
    expect(web).toContain("ExercisePromptProvider");
  });

  it("keeps the shared owner app/framework free", () => {
    const shared = source(
      "packages/learner-workspace/src/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );

    expect(shared).toContain("chooseOneLabel");
    expect(shared).toContain("{chooseOneLabel}");
    expect(shared).toContain(
      'from "./ExercisePromptBridge"',
    );
    expect(shared).toContain(
      'from "./_shared/useRandomizedOptions"',
    );

    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain(
      "@zoeskoul/learner-workspace/",
    );
  });

  it("preserves the exact choose-one fallback contract at the app edge", () => {
    const student = source(
      "apps/student/src/legacy-web/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );
    const web = source(
      "apps/web/src/components/practice/kinds/SingleChoiceExerciseUI.tsx",
    );

    for (const adapter of [student, web]) {
      expect(adapter).toContain(
        'useTaggedT("practiceUi.singleChoice")',
      );
      expect(adapter).toContain(
        'ui.t("chooseOne", {}, "Choose one")',
      );
    }
  });
});
