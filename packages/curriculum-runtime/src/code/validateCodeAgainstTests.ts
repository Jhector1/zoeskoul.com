import { runLocalCode } from "./localRunner.js";
import { getCodeRunner } from "./runner.js";

export type RuntimeCodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

function normOut(s: string) {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trimEnd();
}

function matches(got: string, want: string, mode: "exact" | "includes" = "exact") {
    const G = normOut(got);
    const W = normOut(want);
    return mode === "includes" ? G.includes(W.trim()) : G === W;
}

export async function validateCodeAgainstTests(args: {
    language: string;
    solutionCode: string;
    tests: RuntimeCodeTest[];
    limits?: {
        timeoutMs?: number;
    };
}): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        reason:
            | "runner_unavailable"
            | "execution_failed"
            | "output_mismatch";
        testIndex?: number;
        message: string;
        stdout?: string;
        stderr?: string;
      }
> {
    const runner = getCodeRunner() ?? runLocalCode;
    const trimmedTests = args.tests.slice(0, 8);

    for (let index = 0; index < trimmedTests.length; index += 1) {
        const test = trimmedTests[index]!;
        const run = await runner({
            language: args.language,
            code: args.solutionCode,
            stdin: test.stdin ?? "",
            limits: args.limits,
        });

        if (!run.ok) {
            return {
                ok: false,
                reason:
                    run.error?.includes("No local compiler-side runner is implemented")
                        ? "runner_unavailable"
                        : "execution_failed",
                testIndex: index,
                message:
                    run.error ??
                    `Solution code failed to execute for test #${index + 1}.`,
                stdout: run.stdout,
                stderr: run.stderr,
            };
        }

        if (!matches(run.stdout ?? "", test.stdout ?? "", test.match ?? "exact")) {
            return {
                ok: false,
                reason: "output_mismatch",
                testIndex: index,
                message: `Solution code produced the wrong output for test #${index + 1}.`,
                stdout: run.stdout,
                stderr: run.stderr,
            };
        }
    }

    return { ok: true };
}
