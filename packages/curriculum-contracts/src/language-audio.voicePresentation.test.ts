import {
    describe,
    expect,
    it,
} from "vitest";

import {
    validateLanguageAudioSpec,
} from "./language-audio";

describe(
    "language audio voice presentation",
    () => {
        it(
            "accepts provider-neutral female and male participant voice intent",
            () => {
                const issues =
                    validateLanguageAudioSpec({
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
                                    "Bonjou Jan.",
                            },
                            {
                                speakerId:
                                    "jan",
                                text:
                                    "Bonjou Ana.",
                            },
                        ],
                    });

                expect(
                    issues,
                ).toEqual([]);
            },
        );

        it(
            "rejects unsupported participant voice presentation values",
            () => {
                const issues =
                    validateLanguageAudioSpec({
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
                                    "robot",
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
                                    "ana",
                                text:
                                    "Bonjou.",
                            },
                            {
                                speakerId:
                                    "jan",
                                text:
                                    "Bonjou.",
                            },
                        ],
                    });

                expect(
                    issues.some(
                        (issue) =>
                            issue.includes(
                                "voicePresentation is invalid",
                            ),
                    ),
                ).toBe(true);
            },
        );
    },
);
