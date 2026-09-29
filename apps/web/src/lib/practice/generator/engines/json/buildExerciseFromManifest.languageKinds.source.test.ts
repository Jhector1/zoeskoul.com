import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
    path.resolve(
        process.cwd(),
        "apps/web/src/lib/practice/generator/engines/json/buildExerciseFromManifest.ts",
    ),
    "utf8",
);

describe("published language exercise manifest bridge", () => {
    it.each([
        "text_input",
        "voice_input",
        "word_bank_arrange",
        "listen_build",
    ])("handles %s instead of falling through to Unsupported exercise kind", (kind) => {
        expect(source).toContain(`case "${kind}":`);
    });

    it("preserves compiled expected payloads for canonical server grading", () => {
        const languageCaseRegion = source.slice(
            source.indexOf('case "text_input":'),
            source.indexOf('case "code_input":'),
        );

        expect(languageCaseRegion.match(/expected: def\.expected/g)?.length).toBe(4);
    });

    it("forwards language runtime fields needed by learner UI", () => {
        expect(source).toContain("targetText: def.targetText");
        expect(source).toContain("locale: def.locale");
        expect(source).toContain("maxSeconds: def.maxSeconds");
        expect(source).toContain("wordBank: def.wordBank");
        expect(source).toContain("distractors: def.distractors");
        expect(source).toContain("ttsText: def.ttsText");
        expect(source).toContain("placeholder: def.placeholder");
    });
});
