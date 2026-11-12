import { describe, expect, it } from "vitest";
import { PracticeKind } from "@zoeskoul/db";

import { normalizeExpectedForSave } from "./normalizeExpectedForSave";

describe("normalizeExpectedForSave", () => {
    it("preserves canonical listen_build expected without legacy aliases", () => {
        const expected = {
            kind: "listen_build",
            targetText: "Bonjou.",
            anyOf: ["Bonjou", "Bonjou!"],
            locale: "ht-HT",
            normalize: {
                trim: true,
                caseFold: true,
                collapseSpaces: true,
                stripPunct: true,
            },
        };

        const normalized = normalizeExpectedForSave(
            PracticeKind.listen_build,
            expected,
        );

        expect(normalized).toEqual(expected);
        expect(normalized).not.toHaveProperty("answers");
        expect(normalized).not.toHaveProperty("value");
    });

    it("preserves canonical voice_input expected without legacy aliases", () => {
        const expected = {
            kind: "voice_input",
            targetText: "Kijan ou ye?",
            anyOf: ["Kijan w ye?"],
            locale: "ht-HT",
        };

        const normalized = normalizeExpectedForSave(
            PracticeKind.voice_input,
            expected,
        );

        expect(normalized).toEqual(expected);
        expect(normalized).not.toHaveProperty("answers");
        expect(normalized).not.toHaveProperty("value");
    });

    it("preserves canonical word_bank_arrange expected without legacy aliases", () => {
        const expected = {
            kind: "word_bank_arrange",
            targetText: "M rele Mari.",
            anyOf: ["Mwen rele Mari."],
            locale: "ht-HT",
        };

        const normalized = normalizeExpectedForSave(
            PracticeKind.word_bank_arrange,
            expected,
        );

        expect(normalized).toEqual(expected);
        expect(normalized).not.toHaveProperty("answers");
        expect(normalized).not.toHaveProperty("value");
    });

    it("preserves canonical text_input value without adding answers", () => {
        const expected = {
            kind: "text_input",
            value: "M rete isit la.",
            anyOf: ["Mwen rete isit la."],
        };

        const normalized = normalizeExpectedForSave(
            PracticeKind.text_input,
            expected,
        );

        expect(normalized).toEqual(expected);
        expect(normalized).not.toHaveProperty("answers");
    });

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
    it("preserves semanticFirst for behavior-before-output programming checks", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "python",
            checkMode: "stdout",
            semanticFirst: true,
            tests: [{ stdin: "", stdout: "100\n", match: "exact" }],
            semanticChecks: [
                {
                    type: "method_returns",
                    className: "Car",
                    constructorArgs: ["Honda", "Civic", 100],
                    methodName: "drive",
                    methodArgs: [-5],
                    expected: 100,
                },
            ],
        });

        expect((normalized as any).semanticFirst).toBe(true);
        expect((normalized as any).tests).toEqual([
            { stdin: "", stdout: "100\n", match: "exact" },
        ]);
    });

    it("preserves semanticChecks[].path for multifile Python validation", () => {
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [
                {
                    type: "defines_class",
                    path: "models/car.py",
                    className: "Car",
                },
                {
                    type: "created_instances",
                    path: "main.py",
                    className: "Car",
                    min: 1,
                },
            ],
        });

        expect((normalized as any).semanticChecks).toEqual([
            {
                type: "defines_class",
                path: "models/car.py",
                className: "Car",
            },
            {
                type: "created_instances",
                path: "main.py",
                className: "Car",
                min: 1,
            },
        ]);
    });


    it("preserves a strictly validated private filesystem-only shell task", () => {
        const required = {
            required: [
                { path: "/workspace/secure-project/secrets.env", kind: "file", mode: "0600", uid: 1000, gid: 1000 },
            ],
        };
        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "bash",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            semanticChecks: [],
            adminLabFilesystemExpectations: required,
        });
        expect(normalized).toEqual({
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            adminLabFilesystemExpectations: required,
        });
        // An empty fallback stdout test is NOT evidence for this assessment.
        expect(normalized).not.toHaveProperty("tests");
        expect(normalized).not.toHaveProperty("semanticChecks");
        expect(normalized).not.toHaveProperty("terminalExpectations");
        expect(normalized).not.toHaveProperty("workspaceExpectations");
    });

    it("does not relax Course 1 shell_task requirements", () => {
        const legacyWithoutChecks = {
            kind: "code_input",
            language: "bash",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
        };
        expect(() => normalizeExpectedForSave(PracticeKind.code_input, legacyWithoutChecks))
            .toThrow("shell_task terminal_workspace expected needs workspaceExpectations, terminalExpectations, or hiddenShellCheck");
    });

    it("rejects malformed and mixed-mode admin filesystem contracts without fallback", () => {
        const valid = {
            kind: "code_input",
            language: "bash",
            recipeType: "shell_task",
            shellTaskMode: "terminal_workspace",
            adminLabFilesystemExpectations: {
                required: [{ path: "/workspace/secure-project", kind: "directory", mode: "0755" }],
            },
        };
        const normalize = (value: unknown) => normalizeExpectedForSave(PracticeKind.code_input, value);
        expect(() => normalize({ ...valid, adminLabFilesystemExpectations: { required: [] } })).toThrow();
        expect(() => normalize({ ...valid, language: "python" })).toThrow();
        expect(() => normalize({ ...valid, shellTaskMode: "stdout" })).toThrow();
        expect(() => normalize({ ...valid, terminalExpectations: { requiredCommands: [] } })).toThrow();
        expect(() => normalize({ ...valid, workspaceExpectations: { requiredFiles: ["README.md"] } })).toThrow();
        expect(() => normalize({ ...valid, tests: [{ stdout: "PASS" }] })).toThrow();
        expect(() => normalize({ ...valid, semanticChecks: [{ type: "forbidden" }] })).toThrow();
    });

});
