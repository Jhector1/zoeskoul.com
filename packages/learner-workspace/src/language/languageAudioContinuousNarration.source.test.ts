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
    "continuous bilingual language narration",
    () => {
        it(
            "requests one server-assembled WAV for the whole card",
            () => {
                const speak = source(
                    "packages/learner-workspace/src/language/useSpeak.ts",
                );

                expect(speak).toContain(
                    "const speakSequenceAndWait",
                );

                expect(speak).toContain(
                    "prepareLanguageNarration",
                );

                expect(speak).not.toContain(
                    '"/api/speech/narrate"',
                );

                expect(
                    source(
                        "packages/learner-workspace/src/language/languageAudioPreparation.ts",
                    ),
                ).toContain(
                    '"/api/speech/narrate"',
                );

                expect(speak).not.toContain(
                    "requestBlob",
                );

                expect(speak).toContain(
                    "setIsSpeaking(true)",
                );
            },
        );

        it(
            "uses one sequence call for the whole card",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).toContain(
                    "speech.speakSequenceAndWait",
                );

                expect(player).toContain(
                    "audioRef.current",
                );

                expect(player).not.toContain(
                    "activeSegment",
                );

                expect(player).not.toContain(
                    "setActiveSegment",
                );

                expect(player).not.toContain(
                    "waitForPause",
                );
            },
        );

        it(
            "keeps Speaking tied to continuous whole-card playback",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).toContain(
                    "speech.isPreparing ||\n        speech.isSpeaking",
                );

                expect(player).toContain(
                    ": speech.isSpeaking",
                );

                expect(player).toContain(
                    "? labels.speaking",
                );

                expect(player).not.toContain(
                    "playingAll ||\n                        speech.isSpeaking",
                );
            },
        );

        it(
            "waits for canonical preferences before Auto-listen",
            () => {
                const player = source(
                    "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                );

                expect(player).toContain(
                    "preferencesStatus",
                );

                expect(player).toContain(
                    "autoStartedIdentityRef",
                );
            },
        );
    },
);
