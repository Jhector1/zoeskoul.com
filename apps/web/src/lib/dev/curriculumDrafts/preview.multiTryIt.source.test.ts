import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "apps/web/src/lib/dev/curriculumDrafts/preview.ts"),
  "utf8",
);

describe("raw draft preview embedded Try It multi-step contract", () => {
  it("preserves plural exerciseKeys and builds one ordered project step per key", () => {
    expect(source).toContain("const explicitExerciseKeys = Array.isArray(rawTryIt.exerciseKeys)");
    expect(source).toContain("const embeddedTryItExerciseKeys = Array.from(");
    expect(source).toContain("const tryItSteps = embeddedTryItExerciseKeys.map(");
    expect(source).toContain("exerciseKey: stepExerciseKey");
    expect(source).toContain("steps: tryItSteps");
    expect(source).toContain("exerciseKeys: embeddedTryItExerciseKeys");
  });

  it("keeps the singular exerciseKey as first-key compatibility", () => {
    expect(source).toContain('const singularExerciseKey = asString(rawTryIt.exerciseKey)');
    expect(source).toContain('const exerciseKey = embeddedTryItExerciseKeys[0] ?? ""');
  });

  it("does not keep the legacy single-step construction", () => {
    expect(source).not.toContain("steps: [tryItStep as ReviewProjectStep]");
  });
});
