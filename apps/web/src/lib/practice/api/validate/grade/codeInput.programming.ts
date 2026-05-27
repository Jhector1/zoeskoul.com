// src/lib/practice/api/validate/grade/codeInput.programming.ts
import { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import {
    classifyProgrammingOutputMismatch,
    classifyProgrammingRunFailure,
} from "@/lib/code/feedback";
import { gradeSemanticCodeInput } from "./codeInput.semantic";
import { GradeResult } from "@/lib/practice/api/validate/grade/index";
import type { FileEntry } from "@/lib/code/types";
import { replaceEntryFileContent } from "@/lib/code/workspaceSubmission";
import {
    createJudge0CodeRunnerFromEnv,
    validateCodeAgainstTests,
} from "@zoeskoul/curriculum-runtime";

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

function filesWithCurrentEntryContent(args: {
    entry?: string;
    files?: FileEntry[];
    code: string;
}): FileEntry[] | undefined {
    if (!args.entry || !args.files?.length) {
        return args.files;
    }

    return replaceEntryFileContent({
        entry: args.entry,
        files: args.files,
        content: args.code,
    });
}

function debugRaw(value: unknown): string | null {
    if (value == null) return null;

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
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

    const sharedRunner = createJudge0CodeRunnerFromEnv();

    if (!sharedRunner) {
        const feedback = classifyProgrammingRunFailure(
            language,
            {
                ok: false,
                status: "Error",
                error: "Missing JUDGE0_URL env var.",
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

    const run = await validateCodeAgainstTests({
        language,
        solutionCode: code,
        entry,
        files: filesWithCurrentEntryContent({
            entry,
            files,
            code,
        }),
        tests: expected.tests,
        limits: DEFAULT_LIMITS,
        maxTests: 12,
        runner: sharedRunner,
    });

    if (run.ok) {
        return {
            ok: true,
            explanation: "Correct.",
            feedback: null,
        };
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
            status: "Error",
            stdout: run.stdout,
            stderr: run.stderr,
            error: run.message,
            raw: debugRaw(run),
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