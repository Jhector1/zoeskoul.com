import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const voiceUiPaths = [
    "apps/web/src/components/practice/kinds/VoiceInputExerciseUI.tsx",
    "apps/student/src/legacy-web/components/practice/kinds/VoiceInputExerciseUI.tsx",
];

describe("voice recognition answer isolation", () => {
    for (const relativePath of voiceUiPaths) {
        it(`${relativePath} keeps recognition blind to expected answers`, () => {
            const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");

            expect(source).not.toContain('fd.append("target", exercise.targetText)');
            expect(source).not.toContain("phraseVariants(exercise.targetText)");
            expect(source).not.toContain("phraseVariants(exercise.hint)");
            expect(source).not.toContain("Sijesyon:");
            expect(source).not.toContain("SpeechGrammarList");
            expect(source).not.toContain("webkitSpeechGrammarList");

            expect(source).toContain(
                '"Transkri egzakteman sa w tande a. Pa tradui. "',
            );
            expect(source).toContain(
                '+ "Pa ajoute mo moun nan pa di."',
            );
            expect(source).toContain("scorePhraseMatch({");
        });
    }
});
