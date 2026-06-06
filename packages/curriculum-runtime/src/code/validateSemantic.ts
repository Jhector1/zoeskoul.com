import type { ProgrammingExpected } from "@zoeskoul/practice-checks";
import { validatePythonSemanticCode } from "./validateSemanticPython.js";

export async function validateSemanticCode(args: {
    language: string;
    solutionCode: string;
    expected: ProgrammingExpected;
    files?: Array<{ path: string; content: string }>;
}): Promise<
    | { ok: true }
    | {
        ok: false;
        reason:
            | "unsupported_language"
            | "runner_unavailable"
            | "execution_failed"
            | "semantic_mismatch";
        message: string;
      }
> {
    const normalizedLanguage = String(args.language ?? "").toLowerCase();

    switch (normalizedLanguage) {
        case "python":
        case "py":
            return validatePythonSemanticCode({
                expected: args.expected,
                solutionCode: args.solutionCode,
                files: args.files,
            });
        default:
            return {
                ok: false,
                reason: "unsupported_language",
                message: `Semantic validation is not supported for ${args.language}.`,
            };
    }
}
