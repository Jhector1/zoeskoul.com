import {
    describe,
    expect,
    it,
} from "vitest";

import type {
    LanguageAudioSpec,
} from "@zoeskoul/curriculum-contracts";

import {
    resolveConversationVoice,
    resolveLanguageAudioPauseMs,
    resolveLanguageAudioTurn,
} from "./languageAudioPlayback";

describe(
    "language audio playback policy",
    () => {
        it(
            "assigns distinct deterministic voices to distinct slots",
            () => {
                const voices = [
                    1,
                    2,
                    3,
                ].map(
                    (slot) =>
                        resolveConversationVoice(
                            slot,
                            "marin",
                        ),
                );

                expect(
                    new Set(voices).size,
                ).toBe(3);

                expect(voices[0]).toBe(
                    "marin",
                );

                expect(
                    resolveConversationVoice(
                        2,
                        "marin",
                    ),
                ).toBe(voices[1]);
            },
        );

        it(
            "sends only the exact authored utterance for one turn",
            () => {
                const audio: LanguageAudioSpec =
                    {
                        kind:
                            "conversation",
                        locale: "ht-HT",
                        speakers: [
                            {
                                id: "mari",
                                label: "Mari",
                                voiceSlot: 1,
                                delivery:
                                    "warm",
                            },
                            {
                                id: "pol",
                                label: "Pòl",
                                voiceSlot: 2,
                                delivery:
                                    "relaxed",
                            },
                        ],
                        segments: [
                            {
                                speakerId:
                                    "mari",
                                text:
                                    "Bonjou Pòl. Kijan ou ye?",
                            },
                            {
                                speakerId:
                                    "pol",
                                text:
                                    "Mwen byen. E ou menm?",
                            },
                        ],
                    };

                const turn =
                    resolveLanguageAudioTurn(
                        audio,
                        audio.segments[0],
                    );

                expect(turn.text).toBe(
                    "Bonjou Pòl. Kijan ou ye?",
                );

                expect(
                    turn.text,
                ).not.toContain(
                    "Mari:",
                );

                expect(
                    turn.speakerLabel,
                ).toBe("Mari");

                expect(
                    turn.options.locale,
                ).toBe("ht-HT");

                expect(
                    turn.options.instructions,
                ).toContain(
                    "Do not translate",
                );
            },
        );

        it(
            "uses a natural default conversation pause",
            () => {
                const audio: LanguageAudioSpec =
                    {
                        kind:
                            "conversation",
                        locale: "ht-HT",
                        speakers: [
                            {
                                id: "a",
                                voiceSlot: 1,
                            },
                            {
                                id: "b",
                                voiceSlot: 2,
                            },
                        ],
                        segments: [
                            {
                                speakerId: "a",
                                text: "A.",
                            },
                            {
                                speakerId: "b",
                                text: "B.",
                            },
                        ],
                    };

                expect(
                    resolveLanguageAudioPauseMs(
                        audio,
                        audio.segments[0],
                        0,
                    ),
                ).toBe(320);

                expect(
                    resolveLanguageAudioPauseMs(
                        audio,
                        audio.segments[1],
                        1,
                    ),
                ).toBe(0);
            },
        );

        it(
            "honors explicit turn pauses",
            () => {
                const audio: LanguageAudioSpec =
                    {
                        kind:
                            "read_aloud",
                        locale: "ht-HT",
                        segments: [
                            {
                                text: "Premye.",
                                pauseAfterMs:
                                    700,
                            },
                            {
                                text: "Dezyèm.",
                            },
                        ],
                    };

                expect(
                    resolveLanguageAudioPauseMs(
                        audio,
                        audio.segments[0],
                        0,
                    ),
                ).toBe(700);
            },
        );
    },
);
