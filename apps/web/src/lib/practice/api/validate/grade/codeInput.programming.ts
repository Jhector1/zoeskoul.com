// src/lib/practice/api/validate/grade/codeInput.programming.ts
import { runCode } from "@/lib/code/runCode";
import type { CodeFeedback } from "@/lib/code/feedback/types";

import {ProgrammingExpected} from "@/lib/practice/api/validate/schemas";
import {classifyProgrammingOutputMismatch, classifyProgrammingRunFailure} from "@/lib/code/feedback";

export type GradeResult = {
    ok: boolean;
    explanation: string;
    feedback?: CodeFeedback | null;
};

const DEFAULT_LIMITS = {
    cpu_time_limit: 2,
    wall_time_limit: 6,
    memory_limit: 256000,
} as const;

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

export async function gradeProgrammingCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, language, showDebug } = args;

    const MAX_TESTS = 12;
    const trimmed = expected.tests.slice(0, MAX_TESTS);

    for (const tc of trimmed) {
        const run = await runCode({
            language: language as any,
            code,
            stdin: tc.stdin ?? "",
            limits: DEFAULT_LIMITS,
        } as any);

        if (!run?.ok) {
            const feedback = classifyProgrammingRunFailure(language, run, "check");            return {
                ok: false,
                explanation: feedback.message,
                feedback: showDebug ? feedback : { ...feedback, raw: null },
            };
        }

        const pass = matches(run.stdout ?? "", tc.stdout ?? "", tc.match ?? "exact");
        if (!pass) {
            const feedback = classifyProgrammingOutputMismatch({                got: run.stdout ?? "",
                want: tc.stdout ?? "",
                language,
                code,
                source: "check",
            });

            return {
                ok: false,
                explanation: feedback.message,
                feedback,
            };
        }
    }

    return { ok: true, explanation: "Correct.", feedback: null };
}