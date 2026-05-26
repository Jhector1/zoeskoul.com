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
import type { FileEntry } from "@/lib/code/types";
import { validateCodeAgainstTests } from "@zoeskoul/curriculum-runtime";
const DEFAULT_LIMITS = {
    cpu_time_limit: 2,
    wall_time_limit: 6,
    memory_limit: 256000,
} as const;

type WorkspaceExpectationInput = {
    entryFilePath?: unknown;
    requiredFiles?: unknown;
    requiredFolders?: unknown;
    forbiddenFiles?: unknown;
};

function normalizeWorkspaceExpectationPath(path: unknown): string {
    const raw = String(path ?? "").trim();

    if (!raw) return "";

    /**
     * Submitted workspace paths should already be safe POSIX-style paths
     * because authoring/compiler validation rejects unsafe paths. This runtime
     * normalization is intentionally defensive.
     */
    if (
        raw.startsWith("/") ||
        raw.startsWith("\\") ||
        raw.includes("\\") ||
        /^[a-zA-Z]:[\\/]/.test(raw)
    ) {
        return "";
    }

    if (raw.includes("//")) {
        return "";
    }

    const parts = raw.split("/");

    if (
        parts.length === 0 ||
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        return "";
    }

    return parts.join("/");
}

function asWorkspacePathArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeWorkspaceExpectationPath(item))
        .filter(Boolean);
}

function normalizeSubmittedFilePath(path: unknown): string {
    return normalizeWorkspaceExpectationPath(path);
}

function submittedFolderExists(
    folderPath: string,
    submittedFilePaths: Set<string>,
): boolean {
    const prefix = `${folderPath}/`;

    for (const filePath of submittedFilePaths) {
        if (filePath.startsWith(prefix)) {
            return true;
        }
    }

    return false;
}

function validateWorkspaceExpectations(args: {
    expected: ProgrammingExpected;
    files?: FileEntry[];
}): GradeResult | null {
    const expectations = args.expected
        .workspaceExpectations as WorkspaceExpectationInput | undefined;

    if (!expectations || typeof expectations !== "object") {
        return null;
    }

    const submittedFilePaths = new Set(
        (args.files ?? [])
            .map((file) => normalizeSubmittedFilePath(file.path))
            .filter(Boolean),
    );

    const requiredFiles = asWorkspacePathArray(expectations.requiredFiles);
    const requiredFolders = asWorkspacePathArray(expectations.requiredFolders);
    const forbiddenFiles = asWorkspacePathArray(expectations.forbiddenFiles);

    for (const requiredFile of requiredFiles) {
        if (!submittedFilePaths.has(requiredFile)) {
            return {
                ok: false,
                explanation: `Missing required file: ${requiredFile}`,
                feedback: null,
            };
        }
    }

    for (const requiredFolder of requiredFolders) {
        if (!submittedFolderExists(requiredFolder, submittedFilePaths)) {
            return {
                ok: false,
                explanation: `Missing required folder: ${requiredFolder}`,
                feedback: null,
            };
        }
    }

    for (const forbiddenFile of forbiddenFiles) {
        if (submittedFilePaths.has(forbiddenFile)) {
            return {
                ok: false,
                explanation: `Forbidden file present: ${forbiddenFile}`,
                feedback: null,
            };
        }
    }

    return null;
}

export async function gradeProgrammingCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, language, entry, files, showDebug } = args;

    const workspaceValidation = validateWorkspaceExpectations({
        expected,
        files,
    });

    if (workspaceValidation) {
        return workspaceValidation;
    }

    if (expected.checkMode === "semantic") {
        return gradeSemanticCodeInput({
            expected,
            code,
            language,
            entry,
            files,
            showDebug,
        });
    }

    const run = await validateCodeAgainstTests({
        language,
        solutionCode: code,
        entry,
        files,
        tests: expected.tests,
        limits: DEFAULT_LIMITS as any,
        maxTests: 12,
        runner: async (runnerArgs) => {
            const runnerFiles = Array.isArray(runnerArgs.files)
                ? runnerArgs.files.map((file) => ({
                    path: file.path,
                    content: file.content,
                }))
                : runnerArgs.files;

            const result = await runCode({
                language: runnerArgs.language as any,
                ...(runnerArgs.entry && Array.isArray(runnerFiles) && runnerFiles.length
                    ? {
                        entry: runnerArgs.entry,
                        files: runnerFiles,
                    }
                    : {
                        code: runnerArgs.code,
                    }),
                stdin: runnerArgs.stdin ?? "",
                limits: DEFAULT_LIMITS,
            } as any);

            return {
                ok: Boolean(result?.ok),
                stdout: String(result?.stdout ?? ""),
                stderr: String(result?.stderr ?? result?.compile_output ?? ""),
                error:
                    result?.error ??
                    result?.message ??
                    result?.compile_output ??
                    undefined,
            };
        },
    });

    if (run.ok) {
        return { ok: true, explanation: "Correct.", feedback: null };
    }

    const failedTest = expected.tests[run.testIndex ?? 0];

    if (run.reason === "output_mismatch") {
        const feedback = classifyProgrammingOutputMismatch({
            got: run.stdout ?? "",
            want: failedTest?.stdout ?? "",
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

    const feedback = classifyProgrammingRunFailure(
        language,
        {
            ok: false,
            stdout: run.stdout,
            stderr: run.stderr,
            error: run.message,
        } as any,
        "check",
        code,
    );

    return {
        ok: false,
        explanation: feedback.message,
        feedback: showDebug ? feedback : { ...feedback, raw: null },
    };

}