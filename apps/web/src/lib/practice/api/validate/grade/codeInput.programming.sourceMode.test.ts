import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { createJudge0CodeRunnerFromEnv } from "@zoeskoul/curriculum-runtime";
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import { gradeProgrammingCodeInput } from "./codeInput.programming";

const mockedCreateJudge0CodeRunnerFromEnv = vi.mocked(
    createJudge0CodeRunnerFromEnv,
);

describe("gradeProgrammingCodeInput source mode", () => {
    beforeEach(() => {
        mockedCreateJudge0CodeRunnerFromEnv.mockReset();
    });

    it("accepts matching HTML source without invoking Judge0", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "web",
            checkMode: "source",
            tests: [],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "source_regex",
                    path: "index.html",
                    pattern: "<h1[^>]*>\\s*Hello\\s*</h1>",
                    message: "Add an h1 that says Hello.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "<h1>Hello</h1>",
            language: "web",
            entry: "index.html",
            files: [
                {
                    kind: "file",
                    path: "index.html",
                    content: "<h1>Hello</h1>",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(true);
        expect(mockedCreateJudge0CodeRunnerFromEnv).not.toHaveBeenCalled();
    });

    it("returns authored source feedback when required HTML is missing", async () => {
        const expected: ProgrammingExpected = {
            kind: "code_input",
            strategy: "programming",
            language: "web",
            checkMode: "source",
            tests: [],
            semanticChecks: [],
            sourceChecks: [
                {
                    type: "source_contains",
                    path: "index.html",
                    pattern: "<main>",
                    message: "Add a main element for the primary content.",
                },
            ],
        } as any;

        const result = await gradeProgrammingCodeInput({
            expected,
            code: "<p>Hello</p>",
            language: "web",
            entry: "index.html",
            files: [
                {
                    kind: "file",
                    path: "index.html",
                    content: "<p>Hello</p>",
                },
            ],
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toBe(
            "Add a main element for the primary content.",
        );
        expect(mockedCreateJudge0CodeRunnerFromEnv).not.toHaveBeenCalled();
    });
});
