import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const paths = [
  "packages/learner-workspace/src/components/review/quiz/hooks/useReviewQuizQuestions.ts",
];

describe("useReviewQuizQuestions local question authority", () => {
  for (const relativePath of paths) {
    it(`${relativePath} bypasses stale async loading for local questions`, () => {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

      expect(source).toContain(
        "const localQuestions =\n    localProjectQuestions ?? localAuthoredQuizQuestions;",
      );

      expect(source).toContain("if (localQuestions) {");
      expect(source).toContain("quizLoading: false");
      expect(source).toContain("quizError: null");
      expect(source).toContain("questions: localQuestions");
      expect(source).toContain("serverQuizKey: stableQuizKey");
    });
  }
});
