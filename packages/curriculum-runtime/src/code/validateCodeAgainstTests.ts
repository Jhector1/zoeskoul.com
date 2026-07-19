import { runLocalCode } from "./localRunner.js";
import {
    getCodeRunner,
    normalizeRunCodeFiles,
    type RunCodeFile,
    type RunCodeFiles,
    type RunCodeFn,
    type RunCodeLimits,
} from "./runner.js";
import { createJudge0CodeRunnerFromEnv } from "./judge0Runner.js";
import { stdoutMatches } from "@zoeskoul/practice-checks";

export const DEFAULT_PROGRAMMING_MAX_TESTS = 12;

export type RuntimeCodeFileFixture = RunCodeFile;

export type RuntimeCodeWorkspaceFiles = RunCodeFiles;

export type RuntimeCodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
    files?: RuntimeCodeWorkspaceFiles;
};

function normalizeWorkspaceFiles(
    files: RuntimeCodeWorkspaceFiles | undefined,
): RuntimeCodeFileFixture[] {
    return normalizeRunCodeFiles(files);
}

function mergeWorkspaceFiles(
    baseFiles: RuntimeCodeWorkspaceFiles | undefined,
    overrideFiles: RuntimeCodeWorkspaceFiles | undefined,
): RuntimeCodeFileFixture[] | undefined {
    const merged = new Map<string, RuntimeCodeFileFixture>();

    for (const file of normalizeWorkspaceFiles(baseFiles)) {
        merged.set(file.path, file);
    }

    for (const file of normalizeWorkspaceFiles(overrideFiles)) {
        merged.set(file.path, file);
    }

    return merged.size > 0 ? [...merged.values()] : undefined;
}

function defaultRunner() {
    return getCodeRunner() ?? createJudge0CodeRunnerFromEnv() ?? runLocalCode;
}

export async function validateCodeAgainstTests(args: {
    language: string;
    solutionCode: string;
    entry?: string;
    tests: RuntimeCodeTest[];
    files?: RuntimeCodeWorkspaceFiles;
    limits?: RunCodeLimits;
    maxTests?: number;
    runner?: RunCodeFn;
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
    stdout?: string | null;
    stderr?: string | null;
}
> {
    const runner = args.runner ?? defaultRunner();

    const maxTests = Math.max(
        1,
        Number(args.maxTests ?? DEFAULT_PROGRAMMING_MAX_TESTS),
    );

    const trimmedTests = args.tests.slice(0, maxTests);

    for (let index = 0; index < trimmedTests.length; index += 1) {
        const test = trimmedTests[index]!;

        const run = await runner({
            language: args.language,
            code: args.solutionCode,
            entry: args.entry,
            stdin: test.stdin ?? "",
            files: mergeWorkspaceFiles(args.files, test.files),
            limits: args.limits,
        });

        if (!run.ok) {
            return {
                ok: false,
                reason:
                    run.error?.includes(
                        "No local compiler-side runner is implemented",
                    ) || run.error?.includes("Missing Judge0")
                        ? "runner_unavailable"
                        : "execution_failed",
                testIndex: index,
                message:
                    run.error ??
                    run.message ??
                    run.compile_output ??
                    `Solution code failed to execute for test #${index + 1}.`,
                stdout: run.stdout,
                stderr: run.stderr,
            };
        }

        if (
            !stdoutMatches({
                got: run.stdout ?? "",
                want: test.stdout ?? "",
                mode: test.match ?? "exact",
            })
        ) {
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