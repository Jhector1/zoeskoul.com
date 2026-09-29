import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/contracts/manifestTypes.ts",
    ),
    "utf8",
);

describe("learner-workspace manifest exercise compatibility union", () => {
    it("inherits all canonical non-code manifest exercises", () => {
        expect(source).toContain(
            "type SharedNonCodeManifestExercise = Exclude<",
        );
        expect(source).toContain("SharedManifestExercise,");
        expect(source).toContain('{ kind: "code_input" }');
    });

    it("keeps only the enriched app code_input replacement", () => {
        expect(source).toContain(
            "export type AppManifestExercise =\n"
            + "    | SharedNonCodeManifestExercise\n"
            + "    | AppManifestCodeInput;",
        );
    });

    it.each([
        "text_input",
        "voice_input",
        "word_bank_arrange",
        "listen_build",
        "pseudocode_input",
    ])("inherits %s through the canonical shared union instead of hand-listing it", (kind) => {
        const unionStart = source.indexOf(
            "export type AppManifestExercise =",
        );
        const unionEnd = source.indexOf(
            "/**\n * App-side topic bundle.",
            unionStart,
        );
        const union = source.slice(unionStart, unionEnd);

        expect(union).not.toContain(`| Manifest${kind}`);
        expect(union).toContain("| SharedNonCodeManifestExercise");
    });

    it("does not directly union SharedManifestExercise back in", () => {
        const unionStart = source.indexOf(
            "export type AppManifestExercise =",
        );
        const unionEnd = source.indexOf(
            "/**\n * App-side topic bundle.",
            unionStart,
        );
        const union = source.slice(unionStart, unionEnd);

        expect(union).not.toContain("| SharedManifestExercise");
    });
});
