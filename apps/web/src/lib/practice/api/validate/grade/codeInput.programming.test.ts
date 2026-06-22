import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/code/runCode", () => ({
    runCode: vi.fn(),
}));

vi.mock("@zoeskoul/curriculum-runtime", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@zoeskoul/curriculum-runtime")>();

    return {
        ...actual,
        createJudge0CodeRunnerFromEnv: vi.fn(),
    };
});

import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSemanticCodeInput } from "./codeInput.semantic";
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import { runCode } from "@/lib/code/runCode";
import { createJudge0CodeRunnerFromEnv } from "@zoeskoul/curriculum-runtime";

const mockedRunCode = vi.mocked(runCode);
const mockedCreateJudge0CodeRunnerFromEnv = vi.mocked(
    createJudge0CodeRunnerFromEnv,
);

const mockedSharedRunner = vi.fn();

describe("gradeProgrammingCodeInput", () => {
    beforeEach(() => {
        mockedRunCode.mockReset();
        mockedSharedRunner.mockReset();
        mockedCreateJudge0CodeRunnerFromEnv.mockReset();
        mockedCreateJudge0CodeRunnerFromEnv.mockReturnValue(
            mockedSharedRunner as any,
        );
    });
    it("passes terminal workspace folder checks for empty directories", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            language: "bash",
            workspaceExpectations: {
                requiredFolders: ["site/assets", "site/pages"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            files: [
                { kind: "directory", path: "site" },
                { kind: "directory", path: "site/assets" },
                { kind: "directory", path: "site/pages" },
                { kind: "file", path: "main.sh", content: "" },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("matches required terminal commands from echoed PTY output", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            language: "bash",
            workspaceExpectations: {
                requiredFolders: ["site/assets", "site/pages"],
            },
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern:
                            "^mkdir\\s+-p\\s+.*site/assets.*site/pages|^mkdir\\s+-p\\s+.*site/pages.*site/assets",
                        message: "Create both folders",
                    },
                ],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: [],
                outputText:
                    "[starting workspace terminal]\n[zoeskoul]~$ mkdir -p site/assets site/pages\n[zoeskoul]~$ ls site\nassets pages\n",
            },
            files: [
                { kind: "directory", path: "site" },
                { kind: "directory", path: "site/assets" },
                { kind: "directory", path: "site/pages" },
                { kind: "file", path: "main.sh", content: "" },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });
    it("passes stdout exercises with shared stdout matching", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "4\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
        };

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "n = int(input())\nprint(n + 1)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
        expect(mockedSharedRunner).toHaveBeenCalledWith(
            expect.objectContaining({
                language: "python",
                code: "n = int(input())\nprint(n + 1)\n",
                stdin: "3\n",
            }),
        );
    });


    it("runs semantic state checks after stdout tests pass", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "['Ava', 'Mia', 'Zoe']\n{'Ava': 92, 'Mia': 85, 'Zoe': 97}\n",
            stderr: "",
        });
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: `__ZOE_SEMANTIC_RESULT__${JSON.stringify({
                ok: false,
                errors: ["Variable scores was not defined."],
                userStdout: "",
            })}`,
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "",
                    stdout: "['Ava', 'Mia', 'Zoe']\n{'Ava': 92, 'Mia': 85, 'Zoe': 97}\n",
                    match: "exact",
                },
            ],
            semanticChecks: [
                {
                    type: "variable_equals",
                    name: "scores",
                    expected: [
                        ["Ava", 92],
                        ["Mia", 85],
                        ["Zoe", 97],
                    ],
                    expectedKind: "dict_entries",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print(['Ava', 'Mia', 'Zoe'])\nprint({'Ava': 92, 'Mia': 85, 'Zoe': 97})\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("scores");
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
        expect(mockedRunCode).toHaveBeenCalledOnce();
    });

    it("does not run semantic state checks when stdout already fails", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "wrong\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "right\n", match: "exact" }],
            semanticChecks: [
                {
                    type: "variable_equals",
                    name: "scores",
                    expected: [["Ava", 92]],
                    expectedKind: "dict_entries",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('wrong')\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(mockedRunCode).not.toHaveBeenCalled();
    });


    it("fails source checks before stdout so hard-coded remove/pop output cannot pass", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "",
                    stdout: "['apple']\ncherry\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "source_regex",
                    pattern: '\\bfruits\\.remove\\s*\\(\\s*[\'"]banana[\'"]\\s*\\)',
                    message: "Call fruits.remove('banana') instead of replacing the final list directly.",
                },
                {
                    type: "source_regex",
                    pattern: "\\blast_item\\s*=\\s*fruits\\.pop\\s*\\(\\s*\\)",
                    message: "Store the result of fruits.pop() in last_item.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "fruits = ['apple']\nlast_item = 'cherry'\nprint(\"['apple']\")\nprint('cherry')\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("fruits.remove");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });
    it("accepts a single-name from import for multi-file source checks", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "Ava\n",
            stderr: "",
        });

        const code =
            "from tools.names import clean_name\n\n" +
            "raw_name = input()\n" +
            "print(clean_name(raw_name))\n";

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "  aVA  \n", stdout: "Ava\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                requiredFiles: ["tools/__init__.py", "tools/names.py"],
                requiredFolders: ["tools"],
            },
            sourceChecks: [
                {
                    type: "uses_import",
                    module: "tools.names",
                    importName: "clean_name",
                    path: "main.py",
                    message: "Import from tools.names.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code,
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: code,
                },
                {
                    path: "tools/__init__.py",
                    content: "",
                },
                {
                    path: "tools/names.py",
                    content: "def clean_name(text):\n    return text.strip().title()\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });
    it("runs stdout after source checks pass", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "['apple']\ncherry\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "",
                    stdout: "['apple']\ncherry\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "uses_method",
                    target: "fruits",
                    method: "remove",
                    message: "Use remove().",
                },
                {
                    type: "source_regex",
                    pattern: "\\blast_item\\s*=\\s*fruits\\.pop\\s*\\(\\s*\\)",
                    message: "Store the result of fruits.pop() in last_item.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "fruits = ['apple', 'banana', 'cherry']\nfruits.remove('banana')\nlast_item = fruits.pop()\nprint(fruits)\nprint(last_item)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });


    it("accepts uses_method when the method call is inside an f-string expression", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "POL badge: Opil\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "opil\npol\n",
                    stdout: "POL badge: Opil\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "uses_method",
                    method: "upper",
                    message: "make_badge should uppercase the role.",
                    path: "tools/badges.py",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code:
                "from tools.badges import make_badge\n\n" +
                "name = input().strip().title()\n" +
                "role = input()\n" +
                "print(make_badge(name, role))\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content:
                        "from tools.badges import make_badge\n\n" +
                        "name = input().strip().title()\n" +
                        "role = input()\n" +
                        "print(make_badge(name, role))\n",
                },
                {
                    path: "tools/__init__.py",
                    content: "",
                },
                {
                    path: "tools/badges.py",
                    content:
                        "def make_badge(name, role):\n" +
                        "    return f\"{role.upper()} badge: {name}\"\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });

    it("fails ordered_regex source checks when required steps are out of order", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "",
                    stdout: "['apple']\ncherry\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "ordered_regex",
                    patterns: [
                        '\\bfruits\\.remove\\s*\\(\\s*[\'"]banana[\'"]\\s*\\)',
                        "\\blast_item\\s*=\\s*fruits\\.pop\\s*\\(\\s*\\)",
                        "\\bprint\\s*\\(\\s*fruits\\s*\\)",
                        "\\bprint\\s*\\(\\s*last_item\\s*\\)",
                    ],
                    message: "Follow the required mutation and print order for this exercise.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "fruits = ['apple', 'banana', 'cherry']\nprint(['apple'])\nfruits.remove('banana')\nlast_item = fruits.pop()\nprint(last_item)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("required mutation and print order");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("passes ordered_regex source checks when required steps are in order", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "['apple']\ncherry\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "",
                    stdout: "['apple']\ncherry\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "ordered_regex",
                    patterns: [
                        '\\bfruits\\.remove\\s*\\(\\s*[\'"]banana[\'"]\\s*\\)',
                        "\\blast_item\\s*=\\s*fruits\\.pop\\s*\\(\\s*\\)",
                        "\\bprint\\s*\\(\\s*fruits\\s*\\)",
                        "\\bprint\\s*\\(\\s*last_item\\s*\\)",
                    ],
                    message: "Follow the required mutation and print order for this exercise.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "fruits = ['apple', 'banana', 'cherry']\nfruits.remove('banana')\nlast_item = fruits.pop()\nprint(fruits)\nprint(last_item)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });

    it("submits workspace files for file-enabled stdout checks", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "hello from file\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "hello from file\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
        };

        const code = 'with open("data.txt") as file:\n    print(file.read())\n';

        const result = await gradeProgrammingCodeInput({
            expected,
            code,
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: code,
                },
                {
                    path: "data.txt",
                    content: "hello from file\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledWith(
            expect.objectContaining({
                language: "python",
                code,
                entry: "main.py",
                files: expect.arrayContaining([
                    expect.objectContaining({
                        path: "main.py",
                        content: code,
                    }),
                    expect.objectContaining({
                        path: "data.txt",
                        content: "hello from file\n",
                    }),
                ]),
            }),
        );
    });

    it("fails clearly when a required workspace file is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                requiredFiles: ["helpers/formatting.py"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('ok')\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('ok')\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Missing file: helpers/formatting.py");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("fails clearly when the authored entry file path is missing from the workspace", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                entryFilePath: "main.py",
                requiredFiles: ["tools/__init__.py", "tools/names.py"],
            },
            sourceChecks: [
                {
                    type: "uses_import",
                    module: "tools.names",
                    importName: "clean_name",
                    path: "main.py",
                    message: "Import from tools.names.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "from tools.names import clean_name\nprint(clean_name(input()))\n",
            language: "python",
            entry: "tools/main.py",
            files: [
                {
                    path: "tools/main.py",
                    content: "from tools.names import clean_name\nprint(clean_name(input()))\n",
                },
                {
                    path: "tools/__init__.py",
                    content: "",
                },
                {
                    path: "tools/names.py",
                    content: "def clean_name(text):\n    return text.strip().title()\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Missing file: main.py");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("allows required workspace files and continues with normal grading", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "ok\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                requiredFiles: ["helpers/formatting.py"],
                requiredFolders: ["helpers"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('ok')\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('ok')\n",
                },
                {
                    path: "helpers/formatting.py",
                    content:
                        "def clean_name(name):\n    return name.strip()\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });

    it("fails clearly when a required workspace folder is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                requiredFolders: ["helpers"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('ok')\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('ok')\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Missing folder: helpers");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("allows required folders when a child file exists inside the folder", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "ok\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                requiredFolders: ["helpers"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('ok')\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('ok')\n",
                },
                {
                    path: "helpers/formatting.py",
                    content:
                        "def clean_name(name):\n    return name.strip()\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });

    it("fails when a forbidden workspace file is present", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
            workspaceExpectations: {
                forbiddenFiles: ["solution.py"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "print('ok')\n",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('ok')\n",
                },
                {
                    path: "solution.py",
                    content: "# should not be submitted\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Remove forbidden file: solution.py");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("passes terminal_workspace shell tasks from the workspace snapshot without running Judge0", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: ["linux-lab/notes"],
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            entry: "linux-lab/notes/today.txt",
            files: [
                {
                    kind: "directory",
                    path: "linux-lab",
                },
                {
                    kind: "directory",
                    path: "linux-lab/notes",
                },
                {
                    kind: "file",
                    path: "linux-lab/notes/today.txt",
                    content: "checked from terminal\n",
                },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when a required folder is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: ["linux-lab/notes"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            files: [
                {
                    kind: "directory",
                    path: "linux-lab",
                },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Missing folder: linux-lab/notes");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when a required file is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["linux-lab/notes/today.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            files: [
                {
                    kind: "directory",
                    path: "linux-lab",
                },
                {
                    kind: "directory",
                    path: "linux-lab/notes",
                },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Missing file: linux-lab/notes/today.txt");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when a forbidden file exists", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                forbiddenFiles: ["notes.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            files: [
                {
                    kind: "file",
                    path: "notes.txt",
                    content: "wrong place\n",
                },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Remove forbidden file: notes.txt");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("passes terminal_workspace shell tasks when required commands are present", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern: "^cat\\s+notes/message\\.txt$",
                        message: "Run: cat notes/message.txt",
                    },
                ],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["pwd", "cat notes/message.txt"],
                outputText: "Linux is powerful.\n",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when a required command is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                requiredCommands: [
                    {
                        pattern: "^cat\\s+notes/message\\.txt$",
                        message: "Run: cat notes/message.txt",
                    },
                ],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["ls", "pwd"],
                outputText: "",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Run: cat notes/message.txt");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when a forbidden command is used", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                forbiddenCommands: [
                    {
                        pattern: "^rm\\b",
                        message: "Do not use rm for this task.",
                    },
                ],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["rm notes/message.txt"],
                outputText: "",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Do not use rm for this task.");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("passes terminal_workspace shell tasks when transcript pwd shows the final cwd", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                requiredCommands: [
                    { pattern: "^ls$", message: "Run ls first." },
                    {
                        pattern: "^cd\\s+navigation-practice$",
                        message: "Move into navigation-practice.",
                    },
                    { pattern: "^pwd$", message: "Run pwd after moving." },
                ],
                cwdEndsWith: "navigation-practice",
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["ls", "cd navigation-practice", "pwd"],
                outputText: [
                    "[zoeskoul]~$ ls",
                    "build  main.sh  navigation-practice",
                    "[zoeskoul]~$ cd navigation-practice",
                    "[zoeskoul]~/navigation-practice$ pwd",
                    "/workspace/navigation-practice",
                    "[zoeskoul]~/navigation-practice$",
                ].join("\n"),
                cwd: "/workspace",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("passes terminal_workspace shell tasks when outputContains matches terminal output", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                outputContains: ["Linux is powerful."],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["cat notes/message.txt"],
                outputText: "Linux is powerful.\n",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when outputContains is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                outputContains: ["Linux is powerful."],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["cat notes/message.txt"],
                outputText: "Nothing useful here\n",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe(
            "The terminal output should include: Linux is powerful.",
        );
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("passes terminal_workspace shell tasks when outputRegex matches terminal output", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                outputRegex: ["^draft\\.txt$"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["ls inbox"],
                outputText: "draft.txt\nkeep.txt\n",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails terminal_workspace shell tasks when outputRegex is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                outputRegex: ["^notes$"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["ls"],
                outputText: "linux-start\nREADME.md\n",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe(
            "The terminal output did not match the expected pattern: ^notes$",
        );
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("returns a setup error when terminal expectation regex is invalid", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "", match: "includes" }],
            semanticChecks: [],
            terminalExpectations: {
                requiredCommands: [{ pattern: "(", message: "Run pwd." }],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: ["pwd"],
                outputText: "",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe("Validation setup error");
        expect(result.feedback?.title).toBe("Validation setup error");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
    });

    it("fails stdout exercises when output is wrong", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "5\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "3\n", stdout: "4\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
        };

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "n = int(input())\nprint(n + 2)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(mockedSharedRunner).toHaveBeenCalledOnce();
    });

    it("applies per-test fixture files through the shared runtime validator", async () => {
        mockedSharedRunner
            .mockResolvedValueOnce({
                ok: true,
                stdout: "Alice\nBob\n",
                stderr: "",
            })
            .mockResolvedValueOnce({
                ok: true,
                stdout: "Charlie\n",
                stderr: "",
            });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            language: "python",
            semanticChecks: [],
            tests: [
                {
                    stdin: "",
                    stdout: "Alice\nBob\n",
                    match: "exact",
                    files: [
                        {
                            path: "people.csv",
                            content: "name\nAlice\nBob\n",
                        },
                    ],
                },
                {
                    stdin: "",
                    stdout: "Charlie\n",
                    match: "exact",
                    files: [
                        {
                            path: "people.csv",
                            content: "name\nCharlie\n",
                        },
                    ],
                },
            ],
        } as any;

        const code =
            "import csv\nwith open('people.csv') as f:\n    for row in csv.DictReader(f):\n        print(row['name'])\n";

        const result = await gradeProgrammingCodeInput({
            expected,
            code,
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: code,
                },
                {
                    path: "people.csv",
                    content: "name\nWrong\nData\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedSharedRunner).toHaveBeenCalledTimes(2);

        expect(mockedSharedRunner.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({
                language: "python",
                code,
                entry: "main.py",
                files: expect.arrayContaining([
                    expect.objectContaining({
                        path: "people.csv",
                        content: "name\nAlice\nBob\n",
                    }),
                ]),
            }),
        );

        expect(mockedSharedRunner.mock.calls[1]?.[0]).toEqual(
            expect.objectContaining({
                language: "python",
                code,
                entry: "main.py",
                files: expect.arrayContaining([
                    expect.objectContaining({
                        path: "people.csv",
                        content: "name\nCharlie\n",
                    }),
                ]),
            }),
        );
    });

    it("passes semantic Book exercises with arbitrary book names", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout:
                '__ZOE_SEMANTIC_RESULT__{"ok":true,"errors":[],"userStdout":"Alpha by Beta\\nGamma by Delta\\n"}',
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [
                { type: "defines_class", className: "Book" },
                {
                    type: "constructible",
                    className: "Book",
                    constructorArgs: ["Test Title", "Test Author"],
                },
                {
                    type: "instance_attributes",
                    className: "Book",
                    constructorArgs: ["Test Title", "Test Author"],
                    attributes: ["title", "author"],
                },
                {
                    type: "method_returns",
                    className: "Book",
                    constructorArgs: ["Test Title", "Test Author"],
                    methodName: "description",
                    expected: "Test Title by Test Author",
                },
                { type: "created_instances", className: "Book", min: 2 },
                { type: "printed_line_count", min: 2 },
            ],
        } as any;

        const result = await gradeSemanticCodeInput({
            expected,
            code: `
class Book:
    def __init__(self, title, author):
        self.title = title
        self.author = author

    def description(self):
        return f"{self.title} by {self.author}"

books = [Book("Alpha", "Beta"), Book("Gamma", "Delta")]
for book in books:
    print(book.description())
`,
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("shows hard-coded-output feedback instead of conversion feedback for ci-build-and-show-list", async () => {
        mockedSharedRunner
            .mockResolvedValueOnce({
                ok: true,
                stdout: "['red', 'blue', 'green']\n",
                stderr: "",
            })
            .mockResolvedValueOnce({
                ok: true,
                stdout: "['red', 'blue', 'green']\n",
                stderr: "",
            });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "red\nblue\ngreen\n",
                    stdout: "['red', 'blue', 'green']\n",
                    match: "exact",
                },
                {
                    stdin: "black\nwhite\ngold\n",
                    stdout: "['black', 'white', 'gold']\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code:
                "color1 = input()\n" +
                "color2 = input()\n" +
                "color3 = input()\n" +
                "lyst = [color1, color2, color3]\n" +
                "print(['red','blue','green'])\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toMatch(
            /printing the example values directly|printed value is not using it/i,
        );
        expect(result.explanation).not.toMatch(
            /conversion|math|int\(\)|input\(\) returns text/i,
        );
        expect(result.feedback?.message).toBe(result.explanation);
    });

    it("tells the learner to print the list variable when they build it but print something else", async () => {
        mockedSharedRunner.mockResolvedValue({
            ok: true,
            stdout: "['red', 'blue', 'green']\n",
            stderr: "",
        });

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "stdout",
            tests: [
                {
                    stdin: "black\nwhite\ngold\n",
                    stdout: "['black', 'white', 'gold']\n",
                    match: "exact",
                },
            ],
            semanticChecks: [],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code:
                "color1 = input()\n" +
                "color2 = input()\n" +
                "color3 = input()\n" +
                "lyst = [color1, color2, color3]\n" +
                "example = ['red', 'blue', 'green']\n" +
                "print(example)\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe(
            "You created the list, but the printed value is not using it. Try printing your list variable.",
        );
        expect(result.feedback?.title).toBe("Print the list variable");
    });

    it("infers required empty folders from mkdir terminal evidence when snapshot is stale", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: ["site/assets", "site/pages"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: [],
                outputText:
                    "[zoeskoul]~$ mkdir -p site/pages\n" +
                    "[zoeskoul]~$ mkdir -p site/assets\n",
            },
            files: [{ path: "main.sh", content: "" }] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("infers required files from touch terminal evidence when snapshot is stale", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["site/pages/index.html", "site/assets/logo.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            terminalWorkspaceShellTask: true,
            code: "",
            language: "bash",
            terminalEvidence: {
                commands: [
                    "mkdir -p site/pages",
                    "mkdir -p site/assets",
                    "touch site/pages/index.html",
                    "touch site/assets/logo.txt",
                ],
                outputText: "",
            },
            files: [{ path: "main.sh", content: "" }] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });


    it("infers moved files from mv terminal evidence when snapshot is stale", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["desk/final-name.txt"],
                forbiddenFiles: ["desk/old-name.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "",
            language: "bash",
            terminalWorkspaceShellTask: true,
            terminalEvidence: {
                commands: ["mv desk/old-name.txt desk/final-name.txt"],
                outputText: "",
            },
            files: [
                { path: "main.sh", content: "" },
                { path: "desk/old-name.txt", content: "old" },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });


    it("infers removed files from rm terminal evidence when snapshot is stale", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["trash/keep.txt"],
                forbiddenFiles: ["trash/remove.tmp"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "",
            language: "bash",
            terminalWorkspaceShellTask: true,
            terminalEvidence: { commands: ["rm trash/remove.tmp"], outputText: "" },
            files: [
                { path: "trash/keep.txt", content: "keep" },
                { path: "trash/remove.tmp", content: "remove" },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("infers moved files from mv terminal evidence when snapshot is stale", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFiles: ["desk/final-name.txt"],
                forbiddenFiles: ["desk/old-name.txt"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "",
            language: "bash",
            terminalWorkspaceShellTask: true,
            terminalEvidence: { commands: ["mv desk/old-name.txt desk/final-name.txt"], outputText: "" },
            files: [{ path: "desk/old-name.txt", content: "old" }] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("reconstructs the capstone handoff after failed terminal attempts and a later recovery", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "bash",
            checkMode: "stdout",
            tests: [{ stdout: "", match: "includes" }],
            semanticChecks: [],
            workspaceExpectations: {
                requiredFolders: [
                    "event-room/notes",
                    "event-room/scripts",
                    "event-room/archive",
                    "backups",
                ],
                requiredFiles: [
                    "event-room/notes/agenda.txt",
                    "event-room/scripts/setup.sh",
                    "event-room/archive/guests.txt",
                    "backups/agenda-backup.txt",
                    "event-room/ready.txt",
                ],
                forbiddenFiles: ["event-room/incoming/old.tmp"],
            },
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "",
            language: "bash",
            terminalWorkspaceShellTask: true,
            terminalEvidence: {
                outputText:
                    "[zoeskoul]~$ mv event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "mv: cannot move 'event-room/notes/agenda.txt' to 'backups/agenda-backup.txt': No such file or directory\n" +
                    "[zoeskoul]~$ mkdir backups\n" +
                    "[zoeskoul]~$ mv event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "[zoeskoul]~$ mv backups/agenda-backup.txt event-room/notes/agenda.txt\n" +
                    "[zoeskoul]~$ cp backups/agenda-backup.txt event-room/notes/agenda.txt\n" +
                    "cp: cannot stat 'backups/agenda-backup.txt': No such file or directory\n" +
                    "[zoeskoul]~$ cp event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "[zoeskoul]~$ rm event-room/incoming/old.tmp\n" +
                    "[zoeskoul]~$ touch event-room/ready.txt\n",
            },
            files: [
                { path: "main.sh", content: "" },
                { kind: "directory", path: "event-room" },
                { kind: "directory", path: "event-room/notes" },
                { kind: "directory", path: "event-room/scripts" },
                { kind: "directory", path: "event-room/archive" },
                { path: "event-room/scripts/setup.sh", content: "echo setup lights\n" },
                { path: "event-room/archive/guests.txt", content: "Ari\nSam\nMina\n" },
                { path: "event-room/incoming/old.tmp", content: "delete after cleanup\n" },
            ] as any,
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

});
