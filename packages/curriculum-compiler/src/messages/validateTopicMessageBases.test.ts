import { describe, expect, it } from "vitest";
import { validateTopicMessageBases } from "./validateTopicMessageBases.js";

describe("validateTopicMessageBases", () => {
    it("passes when exercise ids and local message bases are unique", () => {
        expect(() =>
            validateTopicMessageBases([
                { id: "single-1", messageBase: "quiz.single-1" },
                { id: "multi-1", messageBase: "quiz.multi-1" },
                { id: "fill-blank-1", messageBase: "quiz.fill-blank-1" },
            ]),
        ).not.toThrow();
    });

    it("passes when messageBase is omitted and can be derived from id", () => {
        expect(() =>
            validateTopicMessageBases([
                { id: "single-1" },
                { id: "multi-1" },
                { id: "fill-blank-1" },
            ]),
        ).not.toThrow();
    });

    it("fails on duplicate exercise ids inside the same topic", () => {
        expect(() =>
            validateTopicMessageBases([
                { id: "single-1", messageBase: "quiz.single-1" },
                { id: "single-1", messageBase: "quiz.single-2" },
            ]),
        ).toThrow(/Duplicate exercise id/i);
    });

    it("fails on duplicate local messageBase inside the same topic", () => {
        expect(() =>
            validateTopicMessageBases([
                { id: "single-1", messageBase: "quiz.same" },
                { id: "multi-1", messageBase: "quiz.same" },
            ]),
        ).toThrow(/Duplicate messageBase/i);
    });

    it("fails when messageBase is empty", () => {
        expect(() =>
            validateTopicMessageBases([
                { id: "single-1", messageBase: "" },
            ]),
        ).toThrow(/messageBase/i);
    });
});