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
    exportKey:
      "./lib/flow/usePracticeExcuseActions",
    shared:
      "packages/learner-workspace/src/lib/flow/usePracticeExcuseActions.ts",
    web:
      "apps/web/src/lib/flow/usePracticeExcuseActions.ts",
    student:
      "apps/student/src/legacy-web/lib/flow/usePracticeExcuseActions.ts",
    marker: "excuseAndNext",
  },
  {
    exportKey:
      "./practice/experience/canonicalPracticeQueueProjection",
    shared:
      "packages/learner-workspace/src/practice/experience/canonicalPracticeQueueProjection.ts",
    web:
      "apps/web/src/lib/practice/experience/canonicalPracticeQueueProjection.ts",
    student:
      "apps/student/src/legacy-web/lib/practice/experience/canonicalPracticeQueueProjection.ts",
    marker:
      "resolveCanonicalPracticeQueueRows",
  },
  {
    exportKey:
      "./practice/experience/selfPacedCompletionReconciliation",
    shared:
      "packages/learner-workspace/src/practice/experience/selfPacedCompletionReconciliation.ts",
    web:
      "apps/web/src/lib/practice/experience/selfPacedCompletionReconciliation.ts",
    student:
      "apps/student/src/legacy-web/lib/practice/experience/selfPacedCompletionReconciliation.ts",
    marker:
      "reconcileSelfPacedCompletionStack",
  },
] as const;

describe(
  "Practice queue core shared ownership",
  () => {
    it("publishes all three shared owners", () => {
      const pkg = JSON.parse(
        source(
          "packages/learner-workspace/package.json",
        ),
      ) as {
        exports?: Record<string, string>;
      };

      for (const item of migrated) {
        expect(
          pkg.exports?.[item.exportKey],
        ).toBe(
          "./" +
            item.shared.replace(
              "packages/learner-workspace/",
              "",
            ),
        );
      }
    });

    it.each(migrated)(
      "$exportKey leaves identical thin app adapters",
      (item) => {
        const shared = source(item.shared);

        expect(shared).toContain(
          item.marker,
        );

        expect(shared).not.toContain(
          'from "@/',
        );

        expect(shared).not.toContain(
          "next/navigation",
        );

        expect(shared).not.toContain(
          "next-intl",
        );

        const web = source(item.web);
        const student = source(
          item.student,
        );

        expect(web).toBe(student);

        expect(web).toContain(
          "@zoeskoul/learner-workspace/",
        );

        expect(
          web
            .split("\n")
            .filter(Boolean).length,
        ).toBeLessThanOrEqual(3);

        expect(web).not.toContain(
          item.marker,
        );
      },
    );
  },
);
