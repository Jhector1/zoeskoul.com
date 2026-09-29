import { describe, expect, it } from "vitest";

import {
    DEFAULT_VOICE_PHRASE_PASS_THRESHOLD,
    normalizePhraseMatchText,
    scorePhraseMatch,
} from "./phraseMatch";

describe("voice phrase match", () => {
    it("normalizes case, punctuation, spacing, and apostrophe variants", () => {
        expect(
            normalizePhraseMatchText("  MARI,   KIJAN OU YE?  ", "ht-HT"),
        ).toBe("mari kijan ou ye");

        expect(
            normalizePhraseMatchText("M’ rele Mari.", "ht-HT"),
        ).toBe("m' rele mari");
    });

    it("scores an equivalent phrase at 100%", () => {
        expect(
            scorePhraseMatch({
                transcript: "Padon Mari",
                targetText: "Padon, Mari.",
                locale: "ht-HT",
            }),
        ).toMatchObject({
            percent: 100,
            ok: true,
        });
    });

    it("rejects unrelated speech", () => {
        expect(
            scorePhraseMatch({
                transcript: "hhhh",
                targetText: "Padon, Mari.",
                locale: "ht-HT",
            }),
        ).toMatchObject({
            percent: 0,
            ok: false,
        });
    });

    it("rejects a phrase that omits half of a short target", () => {
        const result = scorePhraseMatch({
            transcript: "Padon",
            targetText: "Padon, Mari.",
            locale: "ht-HT",
        });

        expect(result.percent).toBeLessThan(
            DEFAULT_VOICE_PHRASE_PASS_THRESHOLD * 100,
        );
        expect(result.ok).toBe(false);
    });

    it("uses 60% as the default pass boundary", () => {
        const result = scorePhraseMatch({
            transcript: "Mari kijan ou",
            targetText: "Mari, kijan ou ye?",
            locale: "ht-HT",
        });

        expect(result.score).toBeGreaterThanOrEqual(
            DEFAULT_VOICE_PHRASE_PASS_THRESHOLD,
        );
        expect(result.ok).toBe(true);
    });
});
