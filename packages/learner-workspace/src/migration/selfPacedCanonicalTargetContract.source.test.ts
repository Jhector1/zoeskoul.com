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

describe("self-paced canonical completed-target contract", () => {
  it("reuses the canonical Practice completed-target metadata shape", () => {
    const selfPaced = source(
      "packages/learner-workspace/src/practice/experience/"
        + "selfPacedCompletionReconciliation.ts",
    );

    expect(selfPaced).toContain(
      'import type { CanonicalPracticeCompletedTarget } '
        + 'from "./canonicalPracticeQueueProjection";',
    );

    expect(selfPaced).toContain(
      "export type SelfPacedCompletedTarget = "
        + "CanonicalPracticeCompletedTarget;",
    );
  });

  it("canonical completed targets preserve authored metadata", () => {
    const canonical = source(
      "packages/learner-workspace/src/practice/experience/"
        + "canonicalPracticeQueueProjection.ts",
    );

    expect(canonical).toContain(
      "exerciseTitle?: string;",
    );
    expect(canonical).toContain(
      "exerciseKind?: string;",
    );
    expect(canonical).toContain(
      "sectionSlug?: string;",
    );
    expect(canonical).toContain(
      "correct?: boolean;",
    );
  });
});
