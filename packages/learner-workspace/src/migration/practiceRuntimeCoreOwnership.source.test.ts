import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const migrated = [
  {
    exportKey: "./practice/experience/embeddedWorkspace",
    shared:
      "packages/learner-workspace/src/practice/experience/embeddedWorkspace.ts",
    web:
      "apps/web/src/lib/practice/experience/embeddedWorkspace.ts",
    student:
      "apps/student/src/legacy-web/lib/practice/experience/embeddedWorkspace.ts",
  },
  {
    exportKey: "./practice/review/standaloneAutoAdvance",
    shared:
      "packages/learner-workspace/src/practice/review/standaloneAutoAdvance.ts",
    web:
      "apps/web/src/components/practice/review/standaloneAutoAdvance.ts",
    student:
      "apps/student/src/legacy-web/components/practice/review/standaloneAutoAdvance.ts",
  },
  {
    exportKey: "./lib/learning/studentRuntimePracticeDescriptorShared",
    shared:
      "packages/learner-workspace/src/lib/learning/studentRuntimePracticeDescriptorShared.ts",
    web:
      "apps/web/src/lib/learning/studentRuntimePracticeDescriptorShared.ts",
    student:
      "apps/student/src/legacy-web/lib/learning/studentRuntimePracticeDescriptorShared.ts",
  },
] as const;

describe("Practice runtime core shared ownership", () => {
  it("publishes all three shared owners", () => {
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
    "$exportKey leaves identical thin app adapters",
    (item) => {
      const shared = source(item.shared);
      expect(shared).not.toContain('from "@/');
      expect(shared).not.toContain("next/navigation");
      expect(shared).not.toContain("next-intl");

      const web = source(item.web);
      const student = source(item.student);

      expect(web).toBe(student);
      expect(web).toContain("@zoeskoul/learner-workspace/");
      expect(
        web.split("\n").filter(Boolean).length,
      ).toBeLessThanOrEqual(3);
    },
  );

  it("keeps embedded workspace on shared Practice types", () => {
    const shared = source(
      "packages/learner-workspace/src/practice/experience/embeddedWorkspace.ts",
    );
    expect(shared).toContain('from "./types"');
  });

  it("removes app-local QItem coupling from auto-advance policy", () => {
    const shared = source(
      "packages/learner-workspace/src/practice/review/standaloneAutoAdvance.ts",
    );

    expect(shared).toContain("type StandalonePracticeItem");
    expect(shared).toContain(
      'from "../experience/types"',
    );
    expect(shared).not.toContain("QItem");
  });
});
