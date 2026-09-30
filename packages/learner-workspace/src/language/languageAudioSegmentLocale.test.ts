import {
    describe,
    expect,
    it,
} from "vitest";

import type {
    LanguageAudioSpec,
} from "@zoeskoul/curriculum-contracts";

import {
    resolveLanguageAudioTurn,
} from "./languageAudioPlayback";

describe(
    "bilingual language audio segments",
    () => {
        it(
            "uses segment locale before the block fallback",
            () => {
                const audio: LanguageAudioSpec = {
                    kind: "read_aloud",
                    locale: "ht-HT",
                    segments: [
                        {
                            text:
                                "Learn the pairs below.",
                            locale:
                                "en-US",
                        },
                        {
                            text:
                                "pa mwen an",
                            locale:
                                "ht-HT",
                        },
                    ],
                };

                const english =
                    resolveLanguageAudioTurn(
                        audio,
                        audio.segments[0],
                    );

                const kreyol =
                    resolveLanguageAudioTurn(
                        audio,
                        audio.segments[1],
                    );

                expect(
                    english.options.locale,
                ).toBe(
                    "en-US",
                );

                expect(
                    kreyol.options.locale,
                ).toBe(
                    "ht-HT",
                );
            },
        );

        it(
            "keeps the block locale as the fallback",
            () => {
                const audio: LanguageAudioSpec = {
                    kind: "read_aloud",
                    locale: "ht-HT",
                    segments: [
                        {
                            text:
                                "Mwen byen.",
                        },
                    ],
                };

                expect(
                    resolveLanguageAudioTurn(
                        audio,
                        audio.segments[0],
                    ).options.locale,
                ).toBe(
                    "ht-HT",
                );
            },
        );
    },
);
