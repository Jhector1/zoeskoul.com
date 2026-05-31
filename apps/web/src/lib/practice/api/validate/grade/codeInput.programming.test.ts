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
        expect(result.explanation).toBe(
            "Missing required file: helpers/formatting.py",
        );
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
        expect(result.explanation).toBe("Missing required folder: helpers");
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
        expect(result.explanation).toBe("Forbidden file present: solution.py");
        expect(mockedSharedRunner).not.toHaveBeenCalled();
        expect(mockedRunCode).not.toHaveBeenCalled();
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
});
