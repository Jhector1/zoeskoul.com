import { describe, expect, it } from "vitest";
import { normalizeStdout, stdoutMatches } from "./stdout";

describe("stdoutMatches", () => {
    it("passes exact matches", () => {
        expect(stdoutMatches({ got: "hello\n", want: "hello\n", mode: "exact" })).toBe(true);
    });

    it("normalizes trailing newlines", () => {
        expect(normalizeStdout("hello\r\n")).toBe("hello");
        expect(stdoutMatches({ got: "hello\n", want: "hello", mode: "exact" })).toBe(true);
    });

    it("supports includes mode", () => {
        expect(stdoutMatches({ got: "a\nb\nc\n", want: "b", mode: "includes" })).toBe(true);
    });
});
