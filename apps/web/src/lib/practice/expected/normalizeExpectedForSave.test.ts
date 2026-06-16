import { describe, expect, it } from "vitest";
import { PracticeKind } from "@zoeskoul/db";

import { normalizeExpectedForSave } from "./normalizeExpectedForSave";

describe("normalizeExpectedForSave", () => {
    it("preserves code_input solutionFiles in the secret expected payload", () => {
        const solutionFiles = [
            {
                path: "main.py",
                content: "from tools.badges import make_badge\nprint(make_badge('A', 'b'))\n",
                isEntry: true,
                entry: true,
            },
            {
                path: "tools/badges.py",
                content: "def make_badge(name, role):\n    return f'{role}: {name}'\n",
            },
        ];

        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "python",
            stdout: "ok\n",
            solutionCode:
                "from tools.badges import make_badge\nprint(make_badge('A', 'b'))\n",
            solutionFiles,
        });

        expect((normalized as any).solutionFiles).toEqual(solutionFiles);
    });

    it("preserves terminalExpectations for shell_task terminal_workspace expected payloads", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "bash",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern: "^pwd$",
                        message: "Run pwd.",
                    },
                ],
                outputContains: ["/workspace"],
            },
        });

        expect(normalized).toEqual({
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern: "^pwd$",
                        message: "Run pwd.",
                    },
                ],
                outputContains: ["/workspace"],
            },
            tests: [
                {
                    stdout: "",
                    match: "includes",
                },
            ],
        });
    });

    it("keeps terminal_workspace shell tasks working when only workspaceExpectations are provided", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "bash",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: ["linux-lab"],
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
        });

        expect(normalized).toEqual({
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: ["linux-lab"],
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
            tests: [
                {
                    stdout: "",
                    match: "includes",
                },
            ],
        });
    });

    it("keeps existing Python code_input expected payloads on the normal parser path", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "python",
            stdout: "ok\n",
        });

        expect((normalized as any).language).toBe("python");
        expect((normalized as any).strategy).toBe("programming");
        expect((normalized as any).checkMode).toBe("stdout");
        expect((normalized as any).tests).toEqual([
            {
                stdin: "",
                stdout: "ok\n",
                match: "exact",
            },
        ]);
        expect((normalized as any).terminalExpectations).toBeUndefined();
    });

    it("keeps existing SQL expected payloads on the normal parser path", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "sql",
            fixedSqlDialect: "sqlite",
            tests: [
                {
                    compareTo: "expected_table",
                    expectedTable: {
                        columns: ["n"],
                        rows: [[1]],
                    },
                },
            ],
            solutionCode: "select 1 as n;",
        });

        expect((normalized as any).strategy).toBe("sql");
        expect((normalized as any).language).toBe("sql");
        expect((normalized as any).terminalExpectations).toBeUndefined();
    });
});
