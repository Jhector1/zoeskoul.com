import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/curriculum-runtime/src/compat/buildReviewFromManifest.ts",
    ),
    "utf8",
);

describe("multi-exercise embedded Try It compat contract", () => {
    it("accepts exerciseKeys and preserves singular exerciseKey fallback", () => {
        expect(source).toContain("Array.isArray(rawTryIt.exerciseKeys)");
        expect(source).toContain(
            "const legacyExerciseKey = asString(rawTryIt.exerciseKey)",
        );
        expect(source).toContain("const exerciseKey = exerciseKeys[0]");
    });

    it("builds one Try It container with one project step per exercise", () => {
        expect(source).toContain("const tryItSteps = exerciseKeys.map(");
        expect(source).toContain("steps: tryItSteps as any");
        expect(source).toContain("exerciseKeys,");
    });

    it("derives each step kind from its authored exercise", () => {
        expect(source).toContain(
            "const authoredKind = asString(authoredExercise?.kind)",
        );
        expect(source).toContain("preferKind: stepPreferKind");
    });

    it("preserves the existing single-step id shape", () => {
        expect(source).toContain("exerciseKeys.length === 1");
        expect(source).toContain('tryItId.replace(/-/g, "_")');
    });
});
