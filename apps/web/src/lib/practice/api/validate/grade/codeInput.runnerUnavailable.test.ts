import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    runCode: vi.fn(),
    createJudge0CodeRunnerFromEnv: vi.fn(),
}));

vi.mock("@/lib/code/runCode", () => ({
    runCode: mocks.runCode,
}));

vi.mock("@zoeskoul/curriculum-runtime", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@zoeskoul/curriculum-runtime")>();

    return {
        ...actual,
        createJudge0CodeRunnerFromEnv:
            mocks.createJudge0CodeRunnerFromEnv,
    };
});

import { gradeProgrammingCodeInput } from "./codeInput.programming";
import { gradeSemanticCodeInput } from "./codeInput.semantic";
import type { ProgrammingExpected } from "../schemas";

const sharedRunner = vi.fn();

function stdoutExpected() {
    return {
        kind: "code_input",
        strategy: "programming",
        language: "python",
        checkMode: "stdout",
        tests: [
            {
                stdin: "",
                stdout: "ok\n",
                match: "exact",
            },
        ],
        semanticChecks: [],
    } as ProgrammingExpected;
}

function semanticExpected() {
    return {
        kind: "code_input",
        strategy: "programming",
        language: "python",
        checkMode: "semantic",
        tests: [],
        semanticChecks: [
            {
                type: "defines_function",
                functionName: "add_tax",
            },
        ],
    } as unknown as ProgrammingExpected;
}

beforeEach(() => {
    mocks.runCode.mockReset();
    sharedRunner.mockReset();
    mocks.createJudge0CodeRunnerFromEnv.mockReset();
    mocks.createJudge0CodeRunnerFromEnv.mockReturnValue(
        sharedRunner as never,
    );
});

describe("runner-unavailable grading", () => {
    it("returns a retryable infrastructure result for stdout runner outages", async () => {
        sharedRunner.mockResolvedValue({
            ok: false,
            status: "Error",
            error: "fetch failed",
        });

        const result = await gradeProgrammingCodeInput({
            expected: stdoutExpected(),
            code: "print('ok')\n",
            language: "python",
            showDebug: false,
        });

        expect(result.infrastructureFailure).toMatchObject({
            code: "RUNNER_UNAVAILABLE",
            status: 503,
        });
    });

    it("returns a retryable infrastructure result when Judge0 is not configured", async () => {
        mocks.createJudge0CodeRunnerFromEnv.mockReturnValue(null);

        const result = await gradeProgrammingCodeInput({
            expected: stdoutExpected(),
            code: "print('ok')\n",
            language: "python",
            showDebug: false,
        });

        expect(result.infrastructureFailure?.code).toBe(
            "RUNNER_UNAVAILABLE",
        );
    });

    it("keeps learner compilation errors as ordinary incorrect attempts", async () => {
        sharedRunner.mockResolvedValue({
            ok: false,
            status: "Compilation Error",
            compile_output: "SyntaxError: invalid syntax",
        });

        const result = await gradeProgrammingCodeInput({
            expected: stdoutExpected(),
            code: "print(\n",
            language: "python",
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.infrastructureFailure).toBeUndefined();
    });

    it("returns a retryable result for semantic-runner response failures", async () => {
        mocks.runCode.mockResolvedValue({
            ok: false,
            status: "Error",
            error:
                "Runner fetch failed for /submissions: fetch failed",
        });

        const result = await gradeSemanticCodeInput({
            expected: semanticExpected(),
            code: "def add_tax(price):\n    return price + 2\n",
            language: "python",
            showDebug: false,
        });

        expect(result.infrastructureFailure?.code).toBe(
            "RUNNER_UNAVAILABLE",
        );
    });

    it("returns a retryable result when the semantic runner throws a network error", async () => {
        mocks.runCode.mockRejectedValue(
            new TypeError("fetch failed"),
        );

        const result = await gradeSemanticCodeInput({
            expected: semanticExpected(),
            code: "def add_tax(price):\n    return price + 2\n",
            language: "python",
            showDebug: false,
        });

        expect(result.infrastructureFailure?.code).toBe(
            "RUNNER_UNAVAILABLE",
        );
    });
});
