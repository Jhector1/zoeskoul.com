import {
    describe,
    expect,
    it,
} from "vitest";

import {
    readFileSync,
} from "node:fs";

function source(
    path: string,
) {
    return readFileSync(
        path,
        "utf8",
    );
}

describe(
    "language audio prewarm architecture",
    () => {
        it(
            "prewarms the active card through the canonical shared player",
            () => {
                const player =
                    source(
                        "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                    );

                expect(
                    player,
                ).toContain(
                    "speech.prewarmSequence",
                );

                expect(
                    player,
                ).toContain(
                    "buildCurrentSequence",
                );

                expect(
                    player,
                ).toContain(
                    "CURRENT-CARD AUDIO PREWARM OWNER",
                );
            },
        );

        it(
            "shares narration preparation between prewarm and playback",
            () => {
                const speak =
                    source(
                        "packages/learner-workspace/src/language/useSpeak.ts",
                    );

                expect(
                    speak,
                ).toContain(
                    "prepareLanguageNarration",
                );

                expect(
                    speak,
                ).toContain(
                    "prewarmSequence",
                );

                expect(
                    speak,
                ).not.toContain(
                    'fetch(\n                            "/api/speech/narrate"',
                );
            },
        );

        it(
            "keeps browser preparation memory-only",
            () => {
                const prep =
                    source(
                        "packages/learner-workspace/src/language/languageAudioPreparation.ts",
                    );

                expect(
                    prep,
                ).toContain(
                    "preparedNarrationCache",
                );

                expect(
                    prep,
                ).toContain(
                    "MAX_PREPARED_ENTRIES",
                );

                expect(
                    prep,
                ).toContain(
                    "MAX_PREPARED_BYTES",
                );

                for (
                    const forbidden of [
                        "localStorage",
                        "sessionStorage",
                        "indexedDB",
                        "caches.open",
                        "CacheStorage",
                    ]
                ) {
                    expect(
                        prep,
                    ).not.toContain(
                        forbidden,
                    );
                }
            },
        );
    },
);
