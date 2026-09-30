import fs from "node:fs";
import path from "node:path";
import {
    describe,
    expect,
    it,
} from "vitest";

const root = process.cwd();

function source(file: string) {
    return fs.readFileSync(
        path.join(root, file),
        "utf8",
    );
}

describe(
    "language audio auto-listen architecture",
    () => {
        it(
            "keeps the canonical preference default off",
            () => {
                const preferences = source(
                    "packages/preferences/src/index.ts",
                );

                expect(preferences).toContain(
                    "languageAudioAutoPlay: boolean",
                );

                expect(preferences).toContain(
                    "languageAudioAutoPlay: false",
                );

                expect(preferences).toContain(
                    "At least one preference is required.",
                );
            },
        );

        it(
            "keeps playback ownership in learner-workspace",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).toContain(
                    '@zoeskoul/preferences/react',
                );

                expect(player).toMatch(
                    /preferences\s*\.\s*languageAudioAutoPlay/,
                );

                expect(player).toContain(
                    "updatePreferences({",
                );

                expect(player).toContain(
                    "languageAudioAutoPlay:",
                );

                expect(player).toContain(
                    "window.setTimeout",
                );

                expect(player).toContain(
                    "scheduledIdentity",
                );

                const timerStart = player.indexOf(
                    "window.setTimeout",
                );
                expect(timerStart).toBeGreaterThan(-1);

                const timerSource = player.slice(timerStart);
                expect(timerSource).toContain(
                    "autoStartedIdentityRef.current =",
                );
                expect(timerSource).toContain(
                    "scheduledIdentity",
                );

                expect(player).toContain(
                    "stop();",
                );
            },
        );

        it(
            "keeps Web and Student thin adapters",
            () => {
                for (const file of [
                    "apps/web/src/components/sketches/_archetypes/ParagraphSketch.tsx",
                    "apps/student/src/legacy-web/components/sketches/_archetypes/ParagraphSketch.tsx",
                ]) {
                    const text = source(file);

                    expect(text).toContain(
                        "@zoeskoul/learner-workspace/language/LanguageAudioPlayer",
                    );

                    expect(text).toContain(
                        'autoListen: audioT("autoListen")',
                    );

                    expect(text).not.toContain(
                        "languageAudioAutoPlay",
                    );
                }
            },
        );
    },
);
