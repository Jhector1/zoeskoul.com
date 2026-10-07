import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
  {
    exportKey: "./practice/experience/revealCompletion",
    shared: "packages/learner-workspace/src/practice/experience/revealCompletion.ts",
    web: "apps/web/src/lib/practice/experience/revealCompletion.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/revealCompletion.ts",
    forbidden: ['return "explicit"'],
  },
  {
    exportKey: "./practice/leaderboard/visibility",
    shared: "packages/learner-workspace/src/practice/leaderboard/visibility.ts",
    web: "apps/web/src/components/practice/leaderboard/visibility.ts",
    student: "apps/student/src/legacy-web/components/practice/leaderboard/visibility.ts",
    forbidden: ['mode !== "assignment"', 'mode !== "daily_five"'],
  },
  {
    exportKey: "./practice/experience/reviewDisplayStack",
    shared: "packages/learner-workspace/src/practice/experience/reviewDisplayStack.ts",
    web: "apps/web/src/lib/practice/experience/reviewDisplayStack.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/reviewDisplayStack.ts",
    forbidden: ["review.length >= answeredCount"],
  },
  {
    exportKey: "./practice/experience/queueStatus",
    shared: "packages/learner-workspace/src/practice/experience/queueStatus.ts",
    web: "apps/web/src/lib/practice/experience/queueStatus.ts",
    student: "apps/student/src/legacy-web/lib/practice/experience/queueStatus.ts",
    forbidden: ['return "correct"', 'return "revealed"'],
  },
] as const;

describe("Practice policy shared ownership", () => {
  it("publishes all four shared policy owners", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    for (const item of migrated) {
      expect(pkg.exports?.[item.exportKey]).toBe(
        "./" + item.shared.replace("packages/learner-workspace/", ""),
      );
    }
  });

  it.each(migrated)(
    "$exportKey leaves only typed app adapters",
    (item) => {
      const shared = source(item.shared);
      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain("next/navigation");

      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain("@zoeskoul/learner-workspace/practice/");
      for (const marker of item.forbidden) {
        expect(web).not.toContain(marker);
      }
    },
  );
});
