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

const items = [
  {
    packageJson: "packages/learner-workspace/package.json",
    exportKey: "./review/ReviewModuleSkeleton",
    exportTarget: "./src/review/ReviewModuleSkeleton.tsx",
    shared:
      "packages/learner-workspace/src/review/ReviewModuleSkeleton.tsx",
    web:
      "apps/web/src/components/review/module/ReviewModuleSkeleton.tsx",
    student:
      "apps/student/src/legacy-web/components/review/module/ReviewModuleSkeleton.tsx",
    adapterTarget:
      "@zoeskoul/learner-workspace/review/ReviewModuleSkeleton",
  },
  {
    packageJson: "packages/learner-workspace/package.json",
    exportKey: "./practice/shell/SummaryViewSkeleton",
    exportTarget:
      "./src/practice/shell/SummaryViewSkeleton.tsx",
    shared:
      "packages/learner-workspace/src/practice/shell/SummaryViewSkeleton.tsx",
    web:
      "apps/web/src/components/practice/shell/SummaryViewSkeleton.tsx",
    student:
      "apps/student/src/legacy-web/components/practice/shell/SummaryViewSkeleton.tsx",
    adapterTarget:
      "@zoeskoul/learner-workspace/practice/shell/SummaryViewSkeleton",
  },
  {
    packageJson: "packages/learner-workspace/package.json",
    exportKey: "./review/components/CourseCompleteConfetti",
    exportTarget:
      "./src/review/components/CourseCompleteConfetti.tsx",
    shared:
      "packages/learner-workspace/src/review/components/CourseCompleteConfetti.tsx",
    web:
      "apps/web/src/components/review/module/components/CourseCompleteConfetti.tsx",
    student:
      "apps/student/src/legacy-web/components/review/module/components/CourseCompleteConfetti.tsx",
    adapterTarget:
      "@zoeskoul/learner-workspace/review/components/CourseCompleteConfetti",
  },
  {
    packageJson: "packages/learner-workspace/package.json",
    exportKey: "./ai-tutor/AiTutorAvatar",
    exportTarget: "./src/ai-tutor/AiTutorAvatar.tsx",
    shared:
      "packages/learner-workspace/src/ai-tutor/AiTutorAvatar.tsx",
    web:
      "apps/web/src/components/ai-tutor/AiTutorAvatar.tsx",
    student:
      "apps/student/src/legacy-web/components/ai-tutor/AiTutorAvatar.tsx",
    adapterTarget:
      "@zoeskoul/learner-workspace/ai-tutor/AiTutorAvatar",
  },
  {
    packageJson: "packages/learner-ui/package.json",
    exportKey: "./components/ConfirmDialog",
    exportTarget: "./src/components/ConfirmDialog.tsx",
    shared:
      "packages/learner-ui/src/components/ConfirmDialog.tsx",
    web:
      "apps/web/src/components/ui/ConfirmDialog.tsx",
    student:
      "apps/student/src/legacy-web/components/ui/ConfirmDialog.tsx",
    adapterTarget:
      "@zoeskoul/learner-ui/components/ConfirmDialog",
  },
  {
    packageJson: "packages/learner-ui/package.json",
    exportKey: "./components/ConfirmResetModal",
    exportTarget:
      "./src/components/ConfirmResetModal.tsx",
    shared:
      "packages/learner-ui/src/components/ConfirmResetModal.tsx",
    web:
      "apps/web/src/components/practice/ConfirmResetModal.tsx",
    student:
      "apps/student/src/legacy-web/components/practice/ConfirmResetModal.tsx",
    adapterTarget:
      "@zoeskoul/learner-ui/components/ConfirmResetModal",
  },
] as const;

describe("V177 fast-batch shared ownership", () => {
  it.each(items)(
    "$exportKey is exported by its canonical package",
    (item) => {
      const pkg = JSON.parse(
        source(item.packageJson),
      ) as { exports?: Record<string, string> };

      expect(pkg.exports?.[item.exportKey]).toBe(
        item.exportTarget,
      );
    },
  );

  it.each(items)(
    "$exportKey leaves identical thin adapters",
    (item) => {
      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain(item.adapterTarget);
      expect(
        web.split("\n").filter(Boolean).length,
      ).toBeLessThanOrEqual(2);
    },
  );

  it.each(items)(
    "$exportKey has no app aliases in the shared owner",
    (item) => {
      const shared = source(item.shared);

      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain("next/navigation");
      expect(shared).not.toContain("next-intl");
      expect(shared).not.toContain("apps/student");
      expect(shared).not.toContain("apps/web");
    },
  );
});
