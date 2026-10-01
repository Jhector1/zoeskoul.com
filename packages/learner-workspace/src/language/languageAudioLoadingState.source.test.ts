import {
    describe,
    expect,
    it,
} from "vitest";

import {
    readFileSync,
} from "node:fs";

function source(path: string) {
    return readFileSync(
        path,
        "utf8",
    );
}

describe(
    "language audio loading state",
    () => {
        it(
            "separates preparation from audible playback",
            () => {
                const speak = source(
                    "packages/learner-workspace/src/language/useSpeak.ts",
                );

                expect(speak).toContain(
                    "const [isPreparing, setIsPreparing]",
                );

                const sequenceStart =
                    speak.indexOf(
                        "const speakSequenceAndWait",
                    );

                const preparing =
                    speak.indexOf(
                        "setIsPreparing(true)",
                        sequenceStart,
                    );

                const prepare =
                    speak.indexOf(
                        "await prepareLanguageNarration(",
                        sequenceStart,
                    );

                const play =
                    speak.indexOf(
                        "await audio.play()",
                        prepare,
                    );

                const speaking =
                    speak.indexOf(
                        "setIsSpeaking(true)",
                        play,
                    );

                expect(sequenceStart).toBeGreaterThanOrEqual(0);
                expect(preparing).toBeGreaterThan(sequenceStart);
                expect(prepare).toBeGreaterThan(preparing);
                expect(play).toBeGreaterThan(prepare);
                expect(speaking).toBeGreaterThan(play);
            },
        );

        it(
            "shows Loading while preparing and Speaking only during playback",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).toContain(
                    "speech.isPreparing",
                );

                expect(player).toContain(
                    "? labels.loading",
                );

                expect(player).toContain(
                    "? labels.speaking",
                );

                expect(player).not.toContain(
                    "playingAll ||\n                        speech.isSpeaking\n                    )\n                      ? labels.speaking",
                );
            },
        );

        it(
            "keeps loading copy in app i18n instead of the shared component",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).not.toContain(
                    '"Loading…"',
                );

                for (
                    const app of
                    ["student", "web"]
                ) {
                    const bridgePath =
                        app === "web"
                            ? "apps/web/src/components/sketches/_archetypes/ParagraphSketch.tsx"
                            : "apps/student/src/legacy-web/components/sketches/_archetypes/ParagraphSketch.tsx";

                    expect(
                        source(bridgePath),
                    ).toContain(
                        'loading: audioT(',
                    );

                    for (
                        const locale of
                        ["en", "es", "fr", "ht"]
                    ) {
                        const json =
                            JSON.parse(
                                source(
                                    `apps/${app}/src/i18n/messages/${locale}/ui/learning/language-audio.json`,
                                ),
                            );

                        expect(
                            json.languageAudio.loading,
                        ).toBeTruthy();
                    }
                }
            },
        );
    },
);
