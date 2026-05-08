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

    it("passes semantic Book exercises with arbitrary book names", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: '__ZOE_SEMANTIC_RESULT__{"ok":true,"errors":[],"userStdout":"Alpha by Beta\\nGamma by Delta\\n"}',
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [
                { type: "defines_class", className: "Book" },
                { type: "constructible", className: "Book", constructorArgs: ["Test Title", "Test Author"] },
                { type: "instance_attributes", className: "Book", constructorArgs: ["Test Title", "Test Author"], attributes: ["title", "author"] },
                { type: "method_returns", className: "Book", constructorArgs: ["Test Title", "Test Author"], methodName: "description", expected: "Test Title by Test Author" },
                { type: "created_instances", className: "Book", min: 2 },
                { type: "printed_line_count", min: 2 },
            ],
        };

        const result = await gradeSemanticCodeInput({
            expected,
            code: `
class Book:
    def __init__(self, title, author):
        self.title = title
        self.author = author

    def description(self):
        return f"{self.title} by {self.author}"

book1 = Book("Alpha", "Beta")
book2 = Book("Gamma", "Delta")
print(book1.description())
print(book2.description())
`.trim(),
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(true);
    });

    it("fails semantic exercises when class is missing", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: '__ZOE_SEMANTIC_RESULT__{"ok":false,"errors":["Define a class named Book."],"userStdout":""}',
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [{ type: "defines_class", className: "Book" }],
        };

        const result = await gradeSemanticCodeInput({
            expected,
            code: `print("no class here")`,
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("Define a class named Book");
    });

    it("fails semantic exercises when method_returns is wrong", async () => {
        mockedRunCode.mockResolvedValue({
            ok: true,
            stdout: '__ZOE_SEMANTIC_RESULT__{"ok":false,"errors":["description() should return \\"Test Title by Test Author\\", but got \\"wrong\\"."],"userStdout":""}',
        } as any);

        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [
                {
                    type: "method_returns",
                    className: "Book",
                    constructorArgs: ["Test Title", "Test Author"],
                    methodName: "description",
                    expected: "Test Title by Test Author",
                },
            ],
        };

        const result = await gradeSemanticCodeInput({
            expected,
            code: `class Book:\n    def __init__(self, title, author):\n        self.title = title\n        self.author = author\n    def description(self):\n        return "wrong"\n`,
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("description()");
    });

    it("returns clear feedback for unsupported semantic languages", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "javascript",
            checkMode: "semantic",
            tests: [],
            semanticChecks: [{ type: "printed_line_count", min: 1 }],
        };

        const result = await gradeSemanticCodeInput({
            expected,
            code: `console.log("hello")`,
            language: "javascript",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("not supported");
    });
});
