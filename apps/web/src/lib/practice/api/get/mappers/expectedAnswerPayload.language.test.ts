import { describe, expect, it } from "vitest";
import { PracticeKind } from "@zoeskoul/db";

import { buildExpectedAnswerPayload } from "./expectedAnswerPayload.mapper";

describe("language expected answer payloads", () => {
    it.each([
        PracticeKind.voice_input,
        PracticeKind.word_bank_arrange,
        PracticeKind.listen_build,
    ])("keeps %s summaries on targetText", (kind) => {
        expect(
            buildExpectedAnswerPayload(kind, {
                kind,
                targetText: "Bonjou.",
                anyOf: ["Bonjou"],
                locale: "ht-HT",
            }),
        ).toEqual({
            kind: String(kind),
            targetText: "Bonjou.",
        });
    });

    it("keeps text_input on its canonical value field", () => {
        expect(
            buildExpectedAnswerPayload(PracticeKind.text_input, {
                kind: "text_input",
                value: "M rete isit la.",
                anyOf: ["Mwen rete isit la."],
            }),
        ).toEqual({
            kind: "text_input",
            value: "M rete isit la.",
        });
    });
});
