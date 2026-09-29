import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learning-runtime/src/review/module/runtime/reviewTargetRegistry.ts",
    ),
    "utf8",
);

describe("multi-exercise embedded Try It target ownership", () => {
    it("normalizes every embedded project step", () => {
        expect(source).toContain(
            "const embeddedTryItStepContexts = effectiveEmbeddedTryItSteps.flatMap",
        );
        expect(source).not.toContain(
            "const rawEmbeddedTryItStep = asRecord(rawEmbeddedTryItSteps[0]);",
        );
    });

    it("registers one hidden canonical owner for every embedded step", () => {
        expect(source).toContain(
            "for (const embeddedStep of embeddedTryItStepContexts)",
        );
        expect(source).toContain(
            "exerciseId: embeddedStep.exerciseKey",
        );
        expect(source).toContain(
            "toolScopeKey: embeddedExerciseStateKey",
        );
    });

    it("uses the first embedded step only as the card-level tool default", () => {
        expect(source).toContain(
            "const primaryEmbeddedTryItContext =",
        );
        expect(source).toContain(
            "primaryEmbeddedTryItContext?.toolManifest ?? null",
        );
    });
});
