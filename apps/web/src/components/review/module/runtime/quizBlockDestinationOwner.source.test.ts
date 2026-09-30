import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const targets = [
  "apps/web/src/components/review/QuizBlock.tsx",
  "apps/student/src/legacy-web/components/review/QuizBlock.tsx",
];

describe("QuizBlock destination-aware transition owner wiring", () => {
  for (const relativePath of targets) {
    it(`${relativePath} resolves soft navigation against destination identity`, () => {
      const source = readFileSync(resolve(repoRoot, relativePath), "utf8");

      expect(source).toContain("const transitionAuthoredExerciseId = useMemo(() => {");
      expect(source).toContain("const transitionOwnerCardId = quizCardId ?? quizId;");
      expect(source).toContain(
        "authoredExerciseId: transitionAuthoredExerciseId,",
      );
      expect(source).toContain("ownerCardId: transitionOwnerCardId,");

      const occurrences = source.match(
        /authoredExerciseId: transitionAuthoredExerciseId,/g,
      ) ?? [];
      expect(occurrences.length).toBeGreaterThanOrEqual(2);
    });
  }
});
