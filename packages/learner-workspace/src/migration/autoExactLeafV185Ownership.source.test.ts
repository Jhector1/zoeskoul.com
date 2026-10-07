import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const items = [
  {
    name: "useReviewQuizQuestions.ts",
    exportKey: "./components/review/quiz/hooks/useReviewQuizQuestions",
    exportTarget: "./src/components/review/quiz/hooks/useReviewQuizQuestions.ts",
    shared: "packages/learner-workspace/src/components/review/quiz/hooks/useReviewQuizQuestions.ts",
    student: "apps/student/src/legacy-web/components/review/quiz/hooks/useReviewQuizQuestions.ts",
    web: "apps/web/src/components/review/quiz/hooks/useReviewQuizQuestions.ts",
    adapterTarget: "@zoeskoul/learner-workspace/components/review/quiz/hooks/useReviewQuizQuestions",
  },
  {
    name: "useToolDoc.ts",
    exportKey: "./components/tools/hooks/useToolDoc",
    exportTarget: "./src/components/tools/hooks/useToolDoc.ts",
    shared: "packages/learner-workspace/src/components/tools/hooks/useToolDoc.ts",
    student: "apps/student/src/legacy-web/components/tools/hooks/useToolDoc.ts",
    web: "apps/web/src/components/tools/hooks/useToolDoc.ts",
    adapterTarget: "@zoeskoul/learner-workspace/components/tools/hooks/useToolDoc",
  },
] as const;

describe("V185 genuine ownership after V188 correction", () => {
  it.each(items)("$name is exported", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.[item.exportKey]).toBe(item.exportTarget);
  });

  it.each(items)("$name leaves matching thin adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);

    expect(student).toBe(web);
    expect(student).toContain(item.adapterTarget);
    expect(student.split("\n").filter(Boolean).length)
      .toBeLessThanOrEqual(2);
  });

  it.each(items)("$name has no app/Next imports", (item) => {
    const shared = source(item.shared);

    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain("next-intl");
  });
});
