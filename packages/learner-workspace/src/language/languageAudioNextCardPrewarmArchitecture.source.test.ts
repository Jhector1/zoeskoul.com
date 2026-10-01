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
    "next-card language audio prewarm architecture",
    () => {
        const reviewFiles = [
            "apps/web/src/components/review/module/components/content/ReviewTopicCards.tsx",
            "apps/student/src/legacy-web/components/review/module/components/content/ReviewTopicCards.tsx",
        ];

        it(
            "uses canonical review ordering for the immediate next card in both apps",
            () => {
                for (
                    const file of
                    reviewFiles
                ) {
                    const value =
                        source(file);

                    expect(
                        value,
                    ).toContain(
                        "NEXT-CARD AUDIO PREWARM OWNER",
                    );

                    expect(
                        value,
                    ).toMatch(
                        /activeCardIndex\s*\+\s*1/,
                    );

                    expect(
                        value,
                    ).toContain(
                        "getSketchEntry(",
                    );

                    expect(
                        value,
                    ).toContain(
                        "resolveLanguageAudioFromSketchEntry",
                    );

                    expect(
                        value,
                    ).toContain(
                        "scheduleLanguageAudioSpecPrewarm",
                    );

                    expect(
                        value,
                    ).not.toContain(
                        "/api/speech/narrate",
                    );
                }
            },
        );

        it(
            "keeps sequence construction and preparation in learner-workspace",
            () => {
                const prep =
                    source(
                        "packages/learner-workspace/src/language/languageAudioPreparation.ts",
                    );

                const player =
                    source(
                        "packages/learner-workspace/src/language/LanguageAudioPlayer.tsx",
                    );

                expect(
                    prep,
                ).toContain(
                    "buildLanguageAudioNarrationSequence",
                );

                expect(
                    prep,
                ).toContain(
                    "resolveLanguageAudioFromSketchEntry",
                );

                expect(
                    prep,
                ).toContain(
                    "scheduleLanguageAudioSpecPrewarm",
                );

                expect(
                    player,
                ).toContain(
                    "buildLanguageAudioNarrationSequence",
                );
            },
        );

        it(
            "still has exactly one narration endpoint implementation owner",
            () => {
                const prep =
                    source(
                        "packages/learner-workspace/src/language/languageAudioPreparation.ts",
                    );

                const speak =
                    source(
                        "packages/learner-workspace/src/language/useSpeak.ts",
                    );

                expect(
                    prep,
                ).toContain(
                    '"/api/speech/narrate"',
                );

                expect(
                    speak,
                ).not.toContain(
                    '"/api/speech/narrate"',
                );
            },
        );
    },
);
