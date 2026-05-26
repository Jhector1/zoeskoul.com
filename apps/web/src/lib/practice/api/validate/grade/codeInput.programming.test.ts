import { describe, expect, it, vi, beforeEach } from "vitest";
import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSemanticCodeInput } from "./codeInput.semantic";
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";

vi.mock("@/lib/code/runCode", () => ({
    runCode: vi.fn(),
}));

import { runCode } from "@/lib/code/runCode";

const mockedRunCode = vi.mocked(runCode);

describe("gradeProgrammingCodeInput", () => {
    beforeEach(() => {
        mockedRunCode.mockReset();
    });

    it("passes stdout exercises with shared stdout matching", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: "4\n",
            stderr: "",
        } as any);

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
    });

    it("submits workspace files for file-enabled stdout checks", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: "hello from file\n",
            stderr: "",
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            checkMode: "stdout",
            tests: [{ stdin: "", stdout: "hello from file\n", match: "exact" }],
            semanticChecks: [],
            language: "python",
        };

        const result = await gradeProgrammingCodeInput({
            expected,
            code: 'with open("data.txt") as file:\n    print(file.read())\n',
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content:
                        'with open("data.txt") as file:\n    print(file.read())\n',
                },
                {
                    path: "data.txt",
                    content: "hello from file\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedRunCode).toHaveBeenCalledWith(
            expect.objectContaining({
                language: "python",
                entry: "main.py",
                files: [
                    expect.objectContaining({ path: "main.py" }),
                    expect.objectContaining({
                        path: "data.txt",
                        content: "hello from file\n",
                    }),
                ],
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
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("allows required workspace files and continues with normal grading", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: "ok\n",
            stderr: "",
        } as any);

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
        expect(mockedRunCode).toHaveBeenCalledOnce();
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
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("allows required folders when a child file exists inside the folder", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: "ok\n",
            stderr: "",
        } as any);

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
        expect(mockedRunCode).toHaveBeenCalledOnce();
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
        expect(mockedRunCode).not.toHaveBeenCalled();
    });

    it("fails stdout exercises when output is wrong", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: "5\n",
            stderr: "",
        } as any);

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
    });
    it("applies per-test fixture files through the shared runtime validator", async () => {
        mockedRunCode
            .mockResolvedValueOnce({
                ok: true,
                stdout: "Alice\nBob\n",
                stderr: "",
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                stdout: "Charlie\n",
                stderr: "",
            } as any);

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

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "",
            language: "python",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content:
                        "import csv\nwith open('people.csv') as f:\n    for row in csv.DictReader(f):\n        print(row['name'])\n",
                },
                {
                    path: "people.csv",
                    content: "name\nWrong\nData\n",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedRunCode).toHaveBeenCalledTimes(2);

        expect(mockedRunCode.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({
                entry: "main.py",
                files: expect.arrayContaining([
                    expect.objectContaining({
                        path: "people.csv",
                        content: "name\nAlice\nBob\n",
                    }),
                ]),
            }),
        );

        expect(mockedRunCode.mock.calls[1]?.[0]).toEqual(
            expect.objectContaining({
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