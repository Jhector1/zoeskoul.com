import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const voiceUiPaths = [
    "apps/web/src/components/practice/kinds/VoiceInputExerciseUI.tsx",
    "apps/student/src/legacy-web/components/practice/kinds/VoiceInputExerciseUI.tsx",
];

describe("voice input minimal transcript footer", () => {
    for (const relativePath of voiceUiPaths) {
        it(`${relativePath} removes non-actionable footer noise`, () => {
            const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");

            expect(source).not.toContain("Auto-stop off");
            expect(source).not.toContain("{transcript?.length ?? 0}");
            expect(source).toContain("phraseMatch.percent");
        });
    }
});
