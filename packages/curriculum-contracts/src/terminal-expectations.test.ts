import { describe, expect, it } from "vitest";
import {
    normalizeHiddenShellCheck,
    normalizeTerminalExpectations,
} from "./terminal-expectations.js";

describe("terminal expectation normalization", () => {
    it("normalizes the shared Bash and Git terminal contract", () => {
        expect(
            normalizeTerminalExpectations({
                requiredCommands: [
                    { pattern: "  ^git\\s+status$  ", message: "  Run git status.  " },
                ],
                outputContains: ["  On branch main  "],
                cwdEndsWith: "  community-site  ",
            }),
        ).toEqual({
            requiredCommands: [
                { pattern: "^git\\s+status$", message: "Run git status." },
            ],
            outputContains: ["On branch main"],
            cwdEndsWith: "community-site",
        });
    });

    it("rejects null and unknown terminal expectation fields", () => {
        expect(() => normalizeTerminalExpectations(null)).toThrow(
            /expected an object/i,
        );
        expect(() =>
            normalizeTerminalExpectations({ unexpected: true }),
        ).toThrow(/unsupported key/i);
        expect(() =>
            normalizeTerminalExpectations({
                requiredCommands: [{ pattern: "pwd", extra: true }],
            }),
        ).toThrow(/unknown field/i);
    });

    it("normalizes hidden shell checks through the same shared contract", () => {
        expect(
            normalizeHiddenShellCheck({
                script: "  test -f README.md  ",
                timeoutMs: 5000,
            }),
        ).toEqual({
            script: "test -f README.md",
            timeoutMs: 5000,
        });

        expect(() => normalizeHiddenShellCheck(null)).toThrow(
            /expected an object/i,
        );
        expect(() =>
            normalizeHiddenShellCheck({ script: "true", extra: true }),
        ).toThrow(/unsupported key/i);
    });
});
