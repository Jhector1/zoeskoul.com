import type {
    ProgrammingExpected,
    SemanticCheck,
} from "@zoeskoul/practice-checks";
import {
    buildPythonSemanticHarness,
    parseSemanticHarnessResult,
} from "@zoeskoul/practice-checks";
import { runLocalCode } from "./localRunner.js";
import { getCodeRunner } from "./runner.js";

const DEFAULT_LIMITS = {
    timeoutMs: 4000,
} as const;

type FileScopedSemanticCheck = SemanticCheck & {
    path?: string;
};

type SemanticCheckGroup = {
    path: string | null;
    source: string;
    checks: SemanticCheck[];
};

function normalizeSemanticCheckPath(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed) return null;
    if (
        trimmed.includes("\\") ||
        trimmed.startsWith("/") ||
        /^[A-Za-z]:/.test(trimmed)
    ) {
        throw new Error(`Unsafe semantic-check path: ${trimmed}`);
    }

    const parts = trimmed.split("/");
    if (
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".."
        )
    ) {
        throw new Error(`Unsafe semantic-check path: ${trimmed}`);
    }

    return parts.join("/");
}

function stripSemanticCheckPath(check: FileScopedSemanticCheck): SemanticCheck {
    const { path: _path, ...rest } = check;
    return rest as SemanticCheck;
}

function groupSemanticChecks(args: {
    checks: FileScopedSemanticCheck[];
    solutionCode: string;
    files?: Array<{ path: string; content: string }>;
}): SemanticCheckGroup[] {
    const grouped = new Map<
        string,
        { path: string | null; source: string; checks: SemanticCheck[] }
    >();
    const files = Array.isArray(args.files) ? args.files : [];

    for (const rawCheck of args.checks) {
        const path = normalizeSemanticCheckPath(rawCheck.path);
        const key = path ?? "";

        let source = args.solutionCode;
        if (path) {
            const file = files.find((candidate) => {
                try {
                    return normalizeSemanticCheckPath(candidate.path) === path;
                } catch {
                    return false;
                }
            });

            if (!file) {
                throw new Error(`Missing semantic-check solution file: ${path}`);
            }

            source = String(file.content ?? "");
        }

        const current = grouped.get(key);
        const check = stripSemanticCheckPath(rawCheck);

        if (current) {
            current.checks.push(check);
        } else {
            grouped.set(key, {
                path,
                source,
                checks: [check],
            });
        }
    }

    return [...grouped.values()];
}

export async function validatePythonSemanticCode(args: {
    expected: ProgrammingExpected;
    solutionCode: string;
    files?: Array<{ path: string; content: string }>;
    semanticModuleNames?: string[];
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
        args.expected.checkMode === "semantic"
            ? (args.expected.semanticChecks as FileScopedSemanticCheck[])
            : [];

    let groups: SemanticCheckGroup[];
    try {
        groups = groupSemanticChecks({
            checks: semanticChecks,
            solutionCode: args.solutionCode,
            files: args.files,
        });
    } catch (error) {
        return {
            ok: false,
            reason: "execution_failed",
            message:
                error instanceof Error
                    ? error.message
                    : "Invalid semantic-check file path.",
        };
    }

    for (const group of groups) {
        const run = await runner({
            language: "python",
            code: buildPythonSemanticHarness({
                userCode: group.source,
                semanticChecks: group.checks,
                semanticModuleNames: args.semanticModuleNames,
            }),
            stdin: "",
            files: args.files,
            limits: DEFAULT_LIMITS,
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
                message:
                    run.error ??
                    run.stderr ??
                    run.compile_output ??
                    "Semantic runner failed.",
            };
        }

        const parsed = parseSemanticHarnessResult(run.stdout ?? "");

        if (!parsed) {
            return {
                ok: false,
                reason: "execution_failed",
                message:
                    group.path
                        ? `Semantic checker did not return a valid result for ${group.path}.`
                        : "Semantic checker did not return a valid result.",
            };
        }

        if (!parsed.ok) {
            return {
                ok: false,
                reason: "semantic_mismatch",
                message:
                    parsed.errors[0] ??
                    (group.path
                        ? `Solution file ${group.path} did not satisfy semantic checks.`
                        : "Solution did not satisfy semantic checks."),
            };
        }
    }

    return { ok: true };
}
