import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(fileURLToPath(new URL("useQuizPracticeBank.ts", import.meta.url)), "utf8");

describe("Try shell evidence ownership source contract", () => {
  it("prioritizes exact Try identity before terminal evidence", () => {
    expect(source).toContain("rankPracticeRuntimeCandidates(");
    expect(source).toContain("practiceQuestionNeedsTerminalEvidence(q, loadedExpected)");
    expect(source).toContain("(ps.item as any)?.expected");
    expect(source).toContain("needsTerminalEvidence ? null : boundExerciseKey");
    expect(source).toContain("needsTerminalEvidence ? null : activeExerciseKey");
  });
  it("does not use a global workspace snapshot for terminal Trys", () => {
    expect(source).toContain("{ allowUnscopedFallback: !needsTerminalEvidence }");
    expect(source).toContain("if (options.allowUnscopedFallback === false) return null;");
  });
  it("does not take previously bound evidence without target identity", () => {
    const occurrences = source.match(/getLiveTerminalEvidenceForPracticeSubmit\(\[/g) ?? [];
    expect(occurrences).toHaveLength(2);
    const targets = source.split("getLiveTerminalEvidenceForPracticeSubmit([").slice(1);
    for (const target of targets) expect(target.split("])")[0]).not.toMatch(/boundExerciseKey|activeExerciseKey/);
  });
});
