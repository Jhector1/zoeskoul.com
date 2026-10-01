import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("language exercise architecture", () => {
  it("owns WordBank interaction in learner-workspace with thin app bridges", () => {
    const owner = source(
      "packages/learner-workspace/src/practice/kinds/WordBankArrangeExerciseUI.tsx",
    );
    const web = source(
      "apps/web/src/components/practice/kinds/WordBankArrangeExerciseUI.tsx",
    );
    const student = source(
      "apps/student/src/legacy-web/components/practice/kinds/WordBankArrangeExerciseUI.tsx",
    );

    expect(owner).not.toContain("@/");
    expect(owner).not.toContain("_shared/useSpeak");
    expect(owner).not.toContain("ExercisePrompt");
    expect(web).toContain("@zoeskoul/learner-workspace/practice/kinds/WordBankArrangeExerciseUI");
    expect(student).toContain("@zoeskoul/learner-workspace/practice/kinds/WordBankArrangeExerciseUI");
  });

  it("renders word_bank_arrange in both current renderers", () => {
    for (const path of [
      "apps/web/src/components/practice/ExerciseRenderer.tsx",
      "apps/student/src/legacy-web/components/practice/ExerciseRenderer.tsx",
    ]) {
      const text = source(path);
      expect(text).toContain('if (ex.kind === "word_bank_arrange")');
      expect(text).toContain("<WordBankArrangeExerciseUI");
    }
  });

  it("uses locale-aware server speech defaults", () => {
    const route = source("apps/web/src/app/api/speech/speak/route.ts");
    const sharedSpeak = source(
      "packages/learner-workspace/src/language/useSpeak.ts",
    );
    const webSpeak = source(
      "apps/web/src/components/practice/kinds/_shared/useSpeak.ts",
    );

    expect(route).toContain("resolveSpeechSynthesisDefaults");
    expect(route).not.toContain('"Speak in Haitian Creole (Kreyòl ayisyen). Do not switch to English."');

    expect(sharedSpeak).toContain("opts.locale");

    expect(webSpeak).toContain(
      "@zoeskoul/learner-workspace/language/useSpeak",
    );
    expect(webSpeak).not.toContain('"/api/speech/speak"');
  });
});
