// src/lib/practice/api/validate/grade/codeInput.semantic.python.ts
import { runCode } from "@/lib/code/runCode";
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import { GradeResult } from "@/lib/practice/api/validate/grade/index";
import {
    buildPythonSemanticHarness,
    parseSemanticHarnessResult,
} from "@zoeskoul/practice-checks";

const DEFAULT_LIMITS = {
    cpu_time_limit: 2,
    wall_time_limit: 6,
    memory_limit: 256000,
} as const;

function debugRaw(value: unknown): string | null {
    if (value == null) return null;

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export async function gradePythonSemanticCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    showDebug: boolean;
}): Promise<GradeResult> {
    const semanticChecks = args.expected.checkMode === "semantic"
        ? args.expected.semanticChecks
        : [];

    const harness = buildPythonSemanticHarness({
        userCode: args.code,
        semanticChecks,
    });

    const run = await runCode({
        language: "python",
        code: harness,
        stdin: "",
        limits: DEFAULT_LIMITS,
    } as any);

    if (!run?.ok) {
        return {
            ok: false,
            explanation: "Your code could not be checked.",
            feedback: {
                area: "code",
                source: "check",
                kind: "runtime",
                tone: "warning",
                title: "Could not check code",
                message: String((run as any)?.error ?? "The code runner failed."),
                raw: args.showDebug ? debugRaw(run) : null,
            },
        };
    }

    const parsed = parseSemanticHarnessResult(run.stdout ?? "");

    if (!parsed) {
        return {
            ok: false,
            explanation: "The semantic checker did not return a result.",
            feedback: {
                area: "code",
                source: "check",
                kind: "runtime",
                tone: "warning",
                title: "Checker failed",
                message: "The semantic checker did not return a valid result.",
                raw: args.showDebug ? debugRaw(run) : null,
            },
        };
    }

    if (!parsed.ok) {
        const errors = parsed.errors.filter(Boolean);
        const message = errors[0] ?? "Your code does not satisfy the exercise yet.";

        return {
            ok: false,
            explanation: message,
            feedback: {
                area: "code",
                source: "check",
                kind: "logic",
                tone: "warning",
                title: "Not correct yet",
                message,
                raw: args.showDebug
                    ? debugRaw({
                        errors,
                        userStdout: parsed.userStdout,
                    })
                    : null,
            },
        };
    }

    return {
        ok: true,
        explanation: "Correct.",
        feedback: null,
    };
}
