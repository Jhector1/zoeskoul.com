import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

const migrated = [
  {
    exportKey: "./review/hooks/useReviewTopicFlow",
    shared:
      "packages/learner-workspace/src/review/hooks/useReviewTopicFlow.ts",
    web:
      "apps/web/src/components/review/module/hooks/useReviewTopicFlow.ts",
    student:
      "apps/student/src/legacy-web/components/review/module/hooks/useReviewTopicFlow.ts",
    marker: "useReviewTopicFlow",
  },
  {
    exportKey:
      "./review/components/content/ReviewLearningProgress",
    shared:
      "packages/learner-workspace/src/review/components/content/ReviewLearningProgress.tsx",
    web:
      "apps/web/src/components/review/module/components/content/ReviewLearningProgress.tsx",
    student:
      "apps/student/src/legacy-web/components/review/module/components/content/ReviewLearningProgress.tsx",
    marker: "review-learning-progress",
  },
] as const;

describe("Review flow/progress shared ownership", () => {
  it("publishes both shared owners", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    for (const item of migrated) {
      expect(pkg.exports?.[item.exportKey]).toBe(
        "./" +
          item.shared.replace(
            "packages/learner-workspace/",
            "",
          ),
      );
    }
  });

  it.each(migrated)(
    "$exportKey leaves identical re-export adapters",
    (item) => {
      const shared = source(item.shared);
      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain(
        "@zoeskoul/learner-workspace/",
      );
      expect(
        web.split("\n").filter(Boolean).length,
      ).toBeLessThanOrEqual(3);

      expect(shared).toContain(item.marker);
      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain("next/navigation");
      expect(shared).not.toContain("next-intl");
    },
  );
});
