import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V225 CodeInput shared ownership", () => {
  it("exports CodeInput and its i18n bridge", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/kinds/CodeInputExerciseUI"]).toBe("./src/components/practice/kinds/CodeInputExerciseUI.tsx");
    expect(pkg.exports?.["./components/practice/kinds/CodeInputI18nBridge"]).toBe("./src/components/practice/kinds/CodeInputI18nBridge.tsx");
  });

  it("keeps next-intl and tagged hooks in app adapters", () => {
    const student = source("apps/student/src/legacy-web/components/practice/kinds/CodeInputExerciseUI.tsx");
    const web = source("apps/web/src/components/practice/kinds/CodeInputExerciseUI.tsx");

    for (const adapter of [student, web]) {
      expect(adapter).toContain('from "next-intl"');
      expect(adapter).toContain('useTranslations("practice.codeInput")');
      expect(adapter).toContain('useTaggedT("practiceUi.codeInput")');
      expect(adapter).toContain("const tagged = useTaggedT()");
      expect(adapter).toContain("CodeInputI18nProvider");
      expect(adapter).toContain("ExercisePromptProvider");
    }

    expect(student).toContain('from "@student/i18n/tagged"');
    expect(web).toContain('from "@/i18n/tagged"');
  });

  it("keeps the 924-line implementation app/framework neutral", () => {
    const shared = source("packages/learner-workspace/src/components/practice/kinds/CodeInputExerciseUI.tsx");

    expect(shared).toContain("useCodeInputI18n");
    expect(shared).toContain('from "./ExercisePromptBridge"');
    expect(shared).toContain('from "./CodeFeedbackCallout"');
    expect(shared).toContain('from "../../../runner/types"');
    expect(shared.match(/resolveText={resolveText}/g)?.length).toBe(2);
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("useTranslations");
    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("@zoeskoul/learner-workspace/");
  });

  it("defines the audited translation-key surface in the bridge", () => {
    const bridge = source("packages/learner-workspace/src/components/practice/kinds/CodeInputI18nBridge.tsx");
    expect(bridge).toContain('"inputLabel"');
    expect(bridge).toContain('"outputLabel"');
    expect(bridge).toContain('"exampleTitle"');
    expect(bridge).toContain('"expectedExampleMeta"');
    expect(bridge).toContain('"expectedResultTitle"');
    expect(bridge).toContain('"resultPreviewMeta"');
    expect(bridge).toContain('"nullValue"');
    expect(bridge).toContain('"tools.title"');
    expect(bridge).toContain('"tools.language"');
    expect(bridge).toContain('"tools.bound"');
    expect(bridge).toContain('"tools.notBound"');
    expect(bridge).toContain('"tools.desc"');
    expect(bridge).toContain('"tools.bindTitle"');
    expect(bridge).toContain('"tools.boundAria"');
    expect(bridge).toContain('"tools.openAria"');
    expect(bridge).toContain('"tools.boundShort"');
    expect(bridge).toContain('"tools.open"');
    expect(bridge).toContain('"correctSolution"');
    expect(bridge).not.toContain("next-intl");
    expect(bridge).not.toContain("useTaggedT");
  });
});
