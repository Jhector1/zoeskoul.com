import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const items = [
  {
    name: "useQuizAutoAdvance",
    exportKey: "./review/quiz/hooks/useQuizAutoAdvance",
    exportTarget: "./src/review/quiz/hooks/useQuizAutoAdvance.ts",
    shared: "packages/learner-workspace/src/review/quiz/hooks/useQuizAutoAdvance.ts",
    student: "apps/student/src/legacy-web/components/review/quiz/hooks/useQuizAutoAdvance.ts",
    web: "apps/web/src/components/review/quiz/hooks/useQuizAutoAdvance.ts",
    adapterTarget: "@zoeskoul/learner-workspace/review/quiz/hooks/useQuizAutoAdvance",
  },
  {
    name: "ReviewResetDialog",
    exportKey: "./review/components/overlays/ReviewResetDialog",
    exportTarget: "./src/review/components/overlays/ReviewResetDialog.tsx",
    shared: "packages/learner-workspace/src/review/components/overlays/ReviewResetDialog.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/overlays/ReviewResetDialog.tsx",
    web: "apps/web/src/components/review/module/components/overlays/ReviewResetDialog.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/review/components/overlays/ReviewResetDialog",
  },
  {
    name: "ReviewSkeletonSwap",
    exportKey: "./review/components/overlays/ReviewSkeletonSwap",
    exportTarget: "./src/review/components/overlays/ReviewSkeletonSwap.tsx",
    shared: "packages/learner-workspace/src/review/components/overlays/ReviewSkeletonSwap.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/overlays/ReviewSkeletonSwap.tsx",
    web: "apps/web/src/components/review/module/components/overlays/ReviewSkeletonSwap.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/review/components/overlays/ReviewSkeletonSwap",
  },
  {
    name: "ReviewModuleLayout",
    exportKey: "./review/components/layout/ReviewModuleLayout",
    exportTarget: "./src/review/components/layout/ReviewModuleLayout.tsx",
    shared: "packages/learner-workspace/src/review/components/layout/ReviewModuleLayout.tsx",
    student: "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleLayout.tsx",
    web: "apps/web/src/components/review/module/components/layout/ReviewModuleLayout.tsx",
    adapterTarget: "@zoeskoul/learner-workspace/review/components/layout/ReviewModuleLayout",
  },
] as const;

describe("V182 dependency-aware Review cluster ownership", () => {
  it.each(items)("$name is exported", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };
    expect(pkg.exports?.[item.exportKey]).toBe(item.exportTarget);
  });

  it.each(items)("$name leaves thin matching adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);
    expect(student).toBe(web);
    expect(student).toContain(item.adapterTarget);
    expect(student.split("\n").filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it("rewires ReviewResetDialog to shared ConfirmResetModal", () => {
    const shared = source(
      "packages/learner-workspace/src/review/components/overlays/ReviewResetDialog.tsx",
    );
    expect(shared).toContain(
      "@zoeskoul/learner-ui/components/ConfirmResetModal",
    );
    expect(shared).not.toContain("@/components/practice/ConfirmResetModal");
  });

  it("rewires ReviewSkeletonSwap to shared ReviewModuleSkeleton", () => {
    const shared = source(
      "packages/learner-workspace/src/review/components/overlays/ReviewSkeletonSwap.tsx",
    );
    expect(shared).toContain("../../ReviewModuleSkeleton");
    expect(shared).not.toContain(
      "@/components/review/module/ReviewModuleSkeleton",
    );
  });

  it("keeps ReviewModuleLayout on the shared overlay", () => {
    const shared = source(
      "packages/learner-workspace/src/review/components/layout/ReviewModuleLayout.tsx",
    );
    expect(shared).toContain("../overlays/ReviewSkeletonSwap");
  });

  it.each(items)("$name shared owner has no app aliases", (item) => {
    const shared = source(item.shared);
    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain("next-intl");
  });
});
