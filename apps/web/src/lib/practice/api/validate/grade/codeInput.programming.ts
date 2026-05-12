// src/lib/practice/api/validate/grade/codeInput.programming.ts
import { runCode } from "@/lib/code/runCode";
import { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import {
    classifyProgrammingOutputMismatch,
    classifyProgrammingRunFailure,
} from "@/lib/code/feedback";
import { gradeSemanticCodeInput } from "./codeInput.semantic";
import { GradeResult } from "@/lib/practice/api/validate/grade/index";
import { stdoutMatches } from "@zoeskoul/practice-checks";


const DEFAULT_LIMITS = {
    cpu_time_limit: 2,
    wall_time_limit: 6,
    memory_limit: 256000,
} as const;

export async function gradeProgrammingCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, language, showDebug } = args;

    if (expected.checkMode === "semantic") {
        return gradeSemanticCodeInput({
            expected,
            code,
            language,
            showDebug,
        });
    }

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
            const feedback = classifyProgrammingRunFailure(language, run, "check", code);

            return {
                ok: false,
                explanation: feedback.message,
                feedback: showDebug ? feedback : { ...feedback, raw: null },
            };
        }

        const pass = stdoutMatches({
            got: run.stdout ?? "",
            want: tc.stdout ?? "",
            mode: tc.match ?? "exact",
        });

        if (!pass) {
            const feedback = classifyProgrammingOutputMismatch({
                got: run.stdout ?? "",
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
