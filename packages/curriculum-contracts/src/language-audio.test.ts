import { describe, expect, it } from "vitest";

import {
    validateLanguageAudioSpec,
} from "./language-audio.js";

describe("LanguageAudioSpec", () => {
    it("accepts exact read-aloud segments", () => {
        expect(
            validateLanguageAudioSpec({
                kind: "read_aloud",
                locale: "ht-HT",
                segments: [
                    {
                        text: "Li renmen m.",
                    },
                ],
            }),
        ).toEqual([]);
    });

    it("accepts two conversation speakers with two voices", () => {
        expect(
            validateLanguageAudioSpec({
                kind: "conversation",
                locale: "ht-HT",
                speakers: [
                    {
                        id: "mari",
                        voiceSlot: 1,
                        delivery: "warm",
                    },
                    {
                        id: "pol",
                        voiceSlot: 2,
                        delivery: "relaxed",
                    },
                ],
                segments: [
                    {
                        speakerId: "mari",
                        text: "Bonjou Pòl. Kijan ou ye?",
                    },
                    {
                        speakerId: "pol",
                        text: "Mwen byen. E ou menm?",
                    },
                ],
            }),
        ).toEqual([]);
    });

    it("accepts three speakers only with distinct voice slots", () => {
        expect(
            validateLanguageAudioSpec({
                kind: "conversation",
                locale: "ht-HT",
                speakers: [
                    { id: "a", voiceSlot: 1 },
                    { id: "b", voiceSlot: 2 },
                    { id: "c", voiceSlot: 3 },
                ],
                segments: [
                    { speakerId: "a", text: "A." },
                    { speakerId: "b", text: "B." },
                    { speakerId: "c", text: "C." },
                ],
            }),
        ).toEqual([]);
    });

    it("rejects two speakers sharing one voice slot", () => {
        const issues = validateLanguageAudioSpec({
            kind: "conversation",
            locale: "ht-HT",
            speakers: [
                { id: "mari", voiceSlot: 1 },
                { id: "pol", voiceSlot: 1 },
            ],
            segments: [
                {
                    speakerId: "mari",
                    text: "Bonjou.",
                },
                {
                    speakerId: "pol",
                    text: "Bonjou.",
                },
            ],
        });

        expect(
            issues.some((issue) =>
                issue.includes(
                    "duplicate audio voiceSlot",
                ),
            ),
        ).toBe(true);
    });

    it("rejects unknown conversation speakers", () => {
        const issues = validateLanguageAudioSpec({
            kind: "conversation",
            locale: "ht-HT",
            speakers: [
                { id: "mari", voiceSlot: 1 },
                { id: "pol", voiceSlot: 2 },
            ],
            segments: [
                {
                    speakerId: "unknown",
                    text: "Bonjou.",
                },
            ],
        });

        expect(
            issues.some((issue) =>
                issue.includes("unknown speakerId"),
            ),
        ).toBe(true);
    });

    it("does not allow speaker labels on read-aloud audio", () => {
        const issues = validateLanguageAudioSpec({
            kind: "read_aloud",
            locale: "ht-HT",
            segments: [
                {
                    speakerId: "mari",
                    text: "Bonjou.",
                },
            ],
        });

        expect(
            issues.some((issue) =>
                issue.includes(
                    "read_aloud segments must not " +
                    "declare speakerId",
                ),
            ),
        ).toBe(true);
    });
});
