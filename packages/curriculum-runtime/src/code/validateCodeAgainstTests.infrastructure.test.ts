import { describe, expect, it } from "vitest";

import { validateCodeAgainstTests } from "./validateCodeAgainstTests.js";

describe("validateCodeAgainstTests infrastructure classification", () => {
    it("returns runner_unavailable for a runner transport failure", async () => {
        const result = await validateCodeAgainstTests({
            language: "python",
            solutionCode: "print('ok')\n",
            tests: [{ stdout: "ok\n" }],
            runner: async () => ({
                ok: false,
                status: "Error",
                error: "Runner fetch failed for /submissions: fetch failed",
            }),
        });

        expect(result).toMatchObject({
            ok: false,
            reason: "runner_unavailable",
        });
    });

    it("keeps learner compilation errors as execution failures", async () => {
        const result = await validateCodeAgainstTests({
            language: "python",
            solutionCode: "print(\n",
            tests: [{ stdout: "ok\n" }],
            runner: async () => ({
                ok: false,
                status: "Compilation Error",
                compile_output: "SyntaxError: invalid syntax",
            }),
        });

        expect(result).toMatchObject({
            ok: false,
            reason: "execution_failed",
        });
    });
});
