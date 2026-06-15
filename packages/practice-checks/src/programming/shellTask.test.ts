import { describe, expect, it } from "vitest";

import {
    hasTerminalEvidence,
    hasTerminalExpectations,
    isTerminalWorkspaceShellTaskExpectedLike,
    makeShellTaskExpected,
} from "./shellTask.js";
import { parseCodeExpected } from "../codeExpected.js";

describe("shell task expected helpers", () => {
    it("builds a parseable terminal workspace shell_task expected payload", () => {
        const expected = makeShellTaskExpected({
            mode: "terminal_workspace",
            workspaceExpectations: {
                requiredFolders: ["linux-lab"],
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
            terminalExpectations: {
                requiredCommands: [{ pattern: "^pwd$", message: "Run pwd." }],
                outputContains: ["/workspace"],
            },
        });

        expect(expected).toMatchObject({
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            tests: [{ stdout: "", match: "includes" }],
        });
        expect(parseCodeExpected(expected).success).toBe(true);
        expect(isTerminalWorkspaceShellTaskExpectedLike(expected)).toBe(true);
        expect(hasTerminalExpectations(expected)).toBe(true);
    });

    it("recognizes terminal evidence submitted by the web grader", () => {
        expect(
            hasTerminalEvidence({
                terminalEvidence: {
                    commands: ["pwd"],
                    outputText: "/workspace/linux-lab",
                },
            }),
        ).toBe(true);
    });
});
