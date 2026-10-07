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

describe("self-paced completion target contract", () => {
  it("delegates authored target metadata to the canonical Practice target", () => {
    const selfPaced = source(
      "packages/learner-workspace/src/practice/experience/"
        + "selfPacedCompletionReconciliation.ts",
    );

    const canonical = source(
      "packages/learner-workspace/src/practice/experience/"
        + "canonicalPracticeQueueProjection.ts",
    );

    expect(selfPaced).toContain(
      'import type { CanonicalPracticeCompletedTarget } '
        + 'from "./canonicalPracticeQueueProjection";',
    );

    expect(selfPaced).toContain(
      "export type SelfPacedCompletedTarget = "
        + "CanonicalPracticeCompletedTarget;",
    );

    expect(selfPaced).not.toContain(
      "sectionSlug?: string;",
    );

    expect(canonical).toContain(
      "sectionSlug?: string;",
    );

    expect(canonical).toContain(
      "exerciseTitle?: string;",
    );

    expect(canonical).toContain(
      "exerciseKind?: string;",
    );

    expect(canonical).toContain(
      "correct?: boolean;",
    );
  });
});
