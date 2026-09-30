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
    "language audio participant voice presentation",
    () => {
        it(
            "keeps speaker labels out of speech while forwarding female voice intent",
            () => {
                const audio:
                    LanguageAudioSpec = {
                        kind:
                            "conversation",
                        locale:
                            "ht-HT",
                        speakers: [
                            {
                                id:
                                    "ana",
                                label:
                                    "Ana",
                                voiceSlot:
                                    1,
                                voicePresentation:
                                    "female",
                                delivery:
                                    "warm",
                            },
                            {
                                id:
                                    "jan",
                                label:
                                    "Jan",
                                voiceSlot:
                                    2,
                                voicePresentation:
                                    "male",
                            },
                        ],
                        segments: [
                            {
                                speakerId:
                                    "ana",
                                text:
                                    "Bonjou! Kijan ou ye?",
                            },
                            {
                                speakerId:
                                    "jan",
                                text:
                                    "Mwen byen, mèsi.",
                            },
                        ],
                    };

                const turn =
                    resolveLanguageAudioTurn(
                        audio,
                        audio.segments[0],
                    );

                expect(
                    turn.text,
                ).toBe(
                    "Bonjou! Kijan ou ye?",
                );

                expect(
                    turn.text,
                ).not.toContain(
                    "Ana:",
                );

                expect(
                    turn.speakerLabel,
                ).toBe(
                    "Ana",
                );

                expect(
                    turn.options.instructions,
                ).toContain(
                    "natural adult female voice",
                );

                expect(
                    turn.options.instructions,
                ).toContain(
                    "warm",
                );
            },
        );

        it(
            "forwards male voice intent for the same stable participant",
            () => {
                const audio:
                    LanguageAudioSpec = {
                        kind:
                            "conversation",
                        locale:
                            "ht-HT",
                        speakers: [
                            {
                                id:
                                    "ana",
                                voiceSlot:
                                    1,
                                voicePresentation:
                                    "female",
                            },
                            {
                                id:
                                    "jan",
                                voiceSlot:
                                    2,
                                voicePresentation:
                                    "male",
                            },
                        ],
                        segments: [
                            {
                                speakerId:
                                    "jan",
                                text:
                                    "M rele Jan.",
                            },
                            {
                                speakerId:
                                    "jan",
                                text:
                                    "Mwen rete Chicago.",
                            },
                        ],
                    };

                for (
                    const segment
                    of audio.segments
                ) {
                    const turn =
                        resolveLanguageAudioTurn(
                            audio,
                            segment,
                        );

                    expect(
                        turn.options.instructions,
                    ).toContain(
                        "natural adult male voice",
                    );

                    expect(
                        turn.speakerId,
                    ).toBe(
                        "jan",
                    );
                }
            },
        );
    },
);
