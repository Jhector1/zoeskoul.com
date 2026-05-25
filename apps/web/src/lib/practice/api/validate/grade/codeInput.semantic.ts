// src/lib/practice/api/validate/grade/codeInput.semantic.ts
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import type { FileEntry } from "@/lib/code/types";

import { gradePythonSemanticCodeInput } from "./codeInput.semantic.python";
import { GradeResult } from "@/lib/practice/api/validate/grade/index";
// Future:
// import { gradeJavaScriptSemanticCodeInput } from "./codeInput.semantic.javascript";
// import { gradeCppSemanticCodeInput } from "./codeInput.semantic.cpp";


export async function gradeSemanticCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): Promise<GradeResult> {
    const normalizedLanguage = String(args.language || "").toLowerCase();

    switch (normalizedLanguage) {
        case "python":
        case "py":
            return gradePythonSemanticCodeInput({
                expected: args.expected,
                code: args.code,
                language: "python",
                entry: args.entry,
                files: args.files,
                showDebug: args.showDebug,
            });

        /**
         * Add these when the runners are implemented.
         *
         * case "javascript":
         * case "js":
         *   return gradeJavaScriptSemanticCodeInput(...);
         *
         * case "typescript":
         * case "ts":
         *   return gradeJavaScriptSemanticCodeInput(...);
         *
         * case "cpp":
         * case "c++":
         *   return gradeCppSemanticCodeInput(...);
         */

        default:
            return {
                ok: false,
                explanation: `Semantic checking is not supported for ${args.language} yet.`,
                feedback: {
                    area: "code",
                    source: "check",
                    kind: "logic",
                    tone: "warning",
                    title: "Unsupported semantic checker",
                    message: `This exercise uses semantic checks, but ${args.language} does not have a semantic checker implemented yet.`,
                },
            };
    }
}
