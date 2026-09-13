import type { CodeFeedback } from "./types";
import {
    classifyProgrammingOutputMismatch,
    classifyProgrammingRunFailure,
    isProgrammingInputHaltResult,
} from "./classifyProgramming";
import {
    classifySqlMissingResultTable,
    classifySqlResultMismatch,
    classifySqlRunFailure,
} from "./classifySql";

export {
    classifyProgrammingOutputMismatch,
    classifyProgrammingRunFailure,
    isProgrammingInputHaltResult,
} from "./classifyProgramming";

export {
    classifySqlMissingResultTable,
    classifySqlResultMismatch,
    classifySqlRunFailure,
} from "./classifySql";

/**
 * Backward-compatible dispatcher.
 * Keeps old callers working while letting SQL use its own classifier.
 */
export function classifyCodeRunFailure(
    language: string,
    run: any,
    source: "run" | "check" = "run",
    code?: string | null,
) {
    const lang = String(language ?? "").toLowerCase();

    if (lang === "sql") {
        return classifySqlRunFailure(run, source);
    }

    return classifyProgrammingRunFailure(language, run, source, code);
}

/**
 * Backward-compatible dispatcher.
 * Programming still uses stdout comparison.
 * SQL should prefer classifySqlResultMismatch directly.
 */
export function classifyCodeOutputMismatch(args: {
    got: string;
    want: string;
    language: string;
    code: string;
    source?: "run" | "check";
}) {
    const lang = String(args.language ?? "").toLowerCase();

    if (lang === "sql") {
        return classifySqlResultMismatch({
            source: args.source ?? "check",
        });
    }

    return classifyProgrammingOutputMismatch(args);
}

export function pickRunFeedbackFromResult(args: {
    result: any;
    language: string;
    code: string;
}): CodeFeedback | null {
    const result = args.result;
    if (!result || typeof result !== "object") return null;

    if (isInputHaltResult(args.language, result)) {
        return null;
    }

    if (result.feedback && typeof result.feedback === "object") {
        return result.feedback as CodeFeedback;
    }

    if (result.ok === false) {
        return classifyCodeRunFailure(args.language, result, "run", args.code);
    }

    return null;
}

function isInputHaltResult(language: string, result: any) {
    const lang = String(language ?? "").toLowerCase();

    if (lang === "sql") return false;

    return isProgrammingInputHaltResult(language, result);
}