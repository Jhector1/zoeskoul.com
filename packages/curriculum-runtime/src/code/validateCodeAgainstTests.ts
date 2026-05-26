import { runLocalCode } from "./localRunner.js";
import { getCodeRunner, type RunCodeFn } from "./runner.js";
import { stdoutMatches } from "@zoeskoul/practice-checks";

export const DEFAULT_PROGRAMMING_MAX_TESTS = 12;

export type RuntimeCodeFileFixture = {
    path: string;
    content: string;
    readOnly?: boolean;
};

export type RuntimeCodeWorkspaceFiles =
    | RuntimeCodeFileFixture[]
    | Record<string, string>;

export type RuntimeCodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
    files?: RuntimeCodeWorkspaceFiles;
};

function normalizeWorkspaceFiles(
    files: RuntimeCodeWorkspaceFiles | undefined,
): RuntimeCodeFileFixture[] {
    if (!files) return [];

    if (Array.isArray(files)) {
        return files
            .map((file) => {
                const path =
                    typeof file.path === "string" ? file.path.trim() : "";
                if (!path) return null;

                return {
                    path,
                    content: String(file.content ?? ""),
                    ...(typeof file.readOnly === "boolean"
                        ? { readOnly: file.readOnly }
                        : {}),
                };
            })
            .filter((file): file is RuntimeCodeFileFixture => Boolean(file));
    }

    return Object.entries(files).map(([path, content]) => ({
        path,
        content,
    }));
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

export async function validateCodeAgainstTests(args: {
    language: string;
    solutionCode: string;
    entry?: string;
    tests: RuntimeCodeTest[];
    files?: RuntimeCodeWorkspaceFiles;
    limits?: { timeoutMs?: number } & Record<string, unknown>;
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
    stdout?: string;
    stderr?: string;
}
> {
    const runner = args.runner ?? getCodeRunner() ?? runLocalCode;
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
                    )
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