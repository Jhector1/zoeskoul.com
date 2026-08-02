import { describe, expect, it } from "vitest";

import { isRunnerInfrastructureFailure } from "./runner.js";

describe("isRunnerInfrastructureFailure", () => {
    it("recognizes transport, configuration, and Judge0 wait failures", () => {
        expect(
            isRunnerInfrastructureFailure(new TypeError("fetch failed")),
        ).toBe(true);
        expect(
            isRunnerInfrastructureFailure({
                status: "Error",
                error: "connect ECONNREFUSED 127.0.0.1:2358",
            }),
        ).toBe(true);
        expect(
            isRunnerInfrastructureFailure({
                status: "Timeout",
                error: "Execution timed out while waiting for Judge0.",
            }),
        ).toBe(true);
        expect(
            isRunnerInfrastructureFailure({
                status: "Error",
                error: "Missing Judge0 base URL.",
            }),
        ).toBe(true);
    });

    it("does not inspect learner stderr or compilation output", () => {
        expect(
            isRunnerInfrastructureFailure({
                status: "Compilation Error",
                compile_output: "SyntaxError: invalid syntax",
            }),
        ).toBe(false);
        expect(
            isRunnerInfrastructureFailure({
                status: "Runtime Error (NZEC)",
                stderr: "fetch failed",
            }),
        ).toBe(false);
        expect(
            isRunnerInfrastructureFailure({
                status: "Time Limit Exceeded",
                error: undefined,
            }),
        ).toBe(false);
    });
});
