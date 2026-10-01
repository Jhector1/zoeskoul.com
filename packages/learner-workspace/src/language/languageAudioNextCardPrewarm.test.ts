import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildLanguageAudioNarrationSequence,
    resolveLanguageAudioFromSketchEntry,
} from "./languageAudioPreparation";

describe(
    "next-card language audio preparation",
    () => {
        it(
            "uses the registered archetype spec plus card props patch",
            () => {
                const baseAudio = {
                    kind:
                        "read_aloud",
                    locale:
                        "ht-HT",
                    segments: [
                        {
                            text:
                                "Bonjou",
                            locale:
                                "ht-HT",
                        },
                    ],
                };

                const patchedAudio = {
                    kind:
                        "read_aloud",
                    locale:
                        "ht-HT",
                    segments: [
                        {
                            text:
                                "Mèsi",
                            locale:
                                "ht-HT",
                        },
                    ],
                };

                const audio =
                    resolveLanguageAudioFromSketchEntry({
                        entry: {
                            kind:
                                "archetype",
                            spec: {
                                specVersion:
                                    1,
                                archetype:
                                    "paragraph",
                                audio:
                                    baseAudio,
                            },
                        },
                        propsPatch: {
                            audio:
                                patchedAudio,
                        },
                    });

                expect(
                    audio,
                ).toEqual(
                    patchedAudio,
                );
            },
        );

        it(
            "supports props-only archetype fallback just like SketchBlock",
            () => {
                const audio =
                    resolveLanguageAudioFromSketchEntry({
                        entry:
                            null,
                        propsPatch: {
                            specVersion:
                                1,
                            archetype:
                                "paragraph",
                            audio: {
                                kind:
                                    "read_aloud",
                                locale:
                                    "ht-HT",
                                segments: [
                                    {
                                        text:
                                            "Wi",
                                        locale:
                                            "ht-HT",
                                    },
                                ],
                            },
                        },
                    });

                expect(
                    audio?.segments[
                        0
                    ]?.text,
                ).toBe(
                    "Wi",
                );
            },
        );

        it(
            "refuses unresolved tagged narration during speculative prewarm",
            () => {
                expect(
                    resolveLanguageAudioFromSketchEntry({
                        entry: {
                            kind:
                                "archetype",
                            spec: {
                                specVersion:
                                    1,
                                archetype:
                                    "paragraph",
                                audio: {
                                    kind:
                                        "read_aloud",
                                    locale:
                                        "ht-HT",
                                    segments: [
                                        {
                                            text:
                                                "@:some.audio.key",
                                        },
                                    ],
                                },
                            },
                        },
                    }),
                ).toBeNull();
            },
        );

        it(
            "builds exactly the same full-card turn and pause sequence",
            () => {
                const sequence =
                    buildLanguageAudioNarrationSequence({
                        kind:
                            "read_aloud",
                        locale:
                            "ht-HT",
                        segments: [
                            {
                                text:
                                    "Bonjou",
                                locale:
                                    "ht-HT",
                                pauseAfterMs:
                                    350,
                            },
                            {
                                text:
                                    "Mèsi",
                                locale:
                                    "ht-HT",
                            },
                        ],
                    });

                expect(
                    sequence.map(
                        (item) => ({
                            text:
                                item.text,
                            locale:
                                item.opts
                                    ?.locale,
                            pauseMs:
                                item.pauseMs,
                        }),
                    ),
                ).toEqual([
                    {
                        text:
                            "Bonjou",
                        locale:
                            "ht-HT",
                        pauseMs:
                            350,
                    },
                    {
                        text:
                            "Mèsi",
                        locale:
                            "ht-HT",
                        pauseMs:
                            0,
                    },
                ]);
            },
        );
    },
);
