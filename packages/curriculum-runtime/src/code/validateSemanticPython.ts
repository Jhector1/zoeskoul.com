import type { ProgrammingExpected } from "@zoeskoul/practice-checks";
import {
    buildPythonSemanticHarness,
    parseSemanticHarnessResult,
} from "@zoeskoul/practice-checks";
import { runLocalCode } from "./localRunner.js";
import { getCodeRunner } from "./runner.js";

const DEFAULT_LIMITS = {
    timeoutMs: 4000,
} as const;

export async function validatePythonSemanticCode(args: {
    expected: ProgrammingExpected;
    solutionCode: string;
}): Promise<
    | { ok: true }
    | {
        ok: false;
        reason: "runner_unavailable" | "execution_failed" | "semantic_mismatch";
        message: string;
      }
> {
    const runner = getCodeRunner() ?? runLocalCode;
    const semanticChecks =
        args.expected.checkMode === "semantic" ? args.expected.semanticChecks : [];

    const run = await runner({
        language: "python",
        code: buildPythonSemanticHarness({
            userCode: args.solutionCode,
            semanticChecks,
        }),
        stdin: "",
        limits: DEFAULT_LIMITS,
    });

    if (!run.ok) {
        return {
            ok: false,
            reason:
                run.error?.includes("No local compiler-side runner is implemented")
                    ? "runner_unavailable"
                    : "execution_failed",
            message: run.error ?? "Semantic runner failed.",
        };
    }

    const parsed = parseSemanticHarnessResult(run.stdout ?? "");

    if (!parsed) {
        return {
            ok: false,
            reason: "execution_failed",
            message: "Semantic checker did not return a valid result.",
        };
    }

    if (!parsed.ok) {
        return {
            ok: false,
            reason: "semantic_mismatch",
            message: parsed.errors[0] ?? "Solution did not satisfy semantic checks.",
        };
    }

    return { ok: true };
}
