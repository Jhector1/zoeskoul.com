import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseRunReq } from "@/lib/code/api/parseRunReq";

describe("parseRunReq", () => {
    it("accepts a bounded multi-file run request", () => {
        const parsed = parseRunReq({
            language: "python",
            entry: "main.py",
            files: [
                { path: "main.py", content: "print('hi')" },
                { path: "helper.py", content: "def helper():\n    return 42\n" },
            ],
            stdin: "",
        });

        expect(parsed.kind).toBe("code");
        expect("files" in parsed && Array.isArray(parsed.files)).toBe(true);
    });

    it("rejects too many files in a multi-file run", () => {
        expect(() =>
            parseRunReq({
                language: "python",
                entry: "main.py",
                files: Array.from({ length: 21 }, (_, index) => ({
                    path: `f${index}.py`,
                    content: "print('x')",
                })),
            }),
        ).toThrow(/at most 20 files/i);
    });

    it("rejects excessive total multi-file content bytes", () => {
        expect(() =>
            parseRunReq({
                language: "python",
                entry: "main.py",
                files: {
                    "main.py": "x".repeat(260_000),
                    "helper.py": "y".repeat(260_000),
                    "extra.py": "z".repeat(260_000),
                    "more.py": "w".repeat(260_000),
                },
            }),
        ).toThrow(/total content exceeds/i);
    });

    it("rejects too many object-style files in a multi-file run", () => {
        const files = Object.fromEntries(
            Array.from({ length: 21 }, (_, index) => [
                `f${index}.py`,
                "print('x')",
            ]),
        );

        expect(() =>
            parseRunReq({
                language: "python",
                entry: "f0.py",
                files,
            }),
        ).toThrow(/at most 20 files/i);
    });

    it("rejects excessive total multi-file content bytes for array-style files", () => {
        expect(() =>
            parseRunReq({
                language: "python",
                entry: "main.py",
                files: [
                    { path: "main.py", content: "x".repeat(260_000) },
                    { path: "helper.py", content: "y".repeat(260_000) },
                    { path: "extra.py", content: "z".repeat(260_000) },
                    { path: "more.py", content: "w".repeat(260_000) },
                ],
            }),
        ).toThrow(/total content exceeds/i);
    });

    it("preserves client enable_network in parsed limits but does not enforce execution policy here", () => {
        const parsed = parseRunReq({
            language: "python",
            code: "print('hi')",
            limits: {
                enable_network: true,
            },
        });

        expect(parsed.kind).toBe("code");
        if (parsed.kind !== "code") {
            throw new Error("Expected code run request.");
        }
        expect(parsed.limits?.enable_network).toBe(true);
    });
});
