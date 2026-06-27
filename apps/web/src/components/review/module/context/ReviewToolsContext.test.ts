import { describe, expect, it } from "vitest";

import { isSameCodeFeedback } from "./ReviewToolsContext";

describe("isSameCodeFeedback", () => {
    it("treats matching feedback payloads as equal", () => {
        expect(
            isSameCodeFeedback(
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                    line: 2,
                    column: 4,
                    raw: "raw output",
                },
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                    line: 2,
                    column: 4,
                    raw: "raw output",
                },
            ),
        ).toBe(true);
    });

    it("detects changed feedback content", () => {
        expect(
            isSameCodeFeedback(
                {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Not correct yet",
                    message: "Try again.",
                },
                {
                    area: "code",
                    source: "check",
                    kind: "runtime",
                    tone: "danger",
                    title: "Runtime error",
                    message: "Boom",
                },
            ),
        ).toBe(false);
    });
});
