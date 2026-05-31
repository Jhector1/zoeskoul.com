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

type SourceCheckInput = {
    type?: unknown;
    message?: unknown;
    pattern?: unknown;
    patterns?: unknown;
    normalizeWhitespace?: unknown;
    path?: unknown;
    method?: unknown;
    target?: unknown;
    functionName?: unknown;
    index?: unknown;
    iterable?: unknown;
    key?: unknown;
    variable?: unknown;
    module?: unknown;
    importName?: unknown;
};

function getSourceChecks(expected: ProgrammingExpected): SourceCheckInput[] {
    const checks = (expected as any)?.sourceChecks;
    return Array.isArray(checks)
        ? checks.filter((check): check is SourceCheckInput => Boolean(check) && typeof check === "object")
        : [];
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSourceWhitespace(source: string): string {
    return source.replace(/\s+/g, "");
}

function stripPythonComments(source: string): string {
    const lines = source.split(/\r?\n/);

    return lines
        .map((line) => {
            let quote: "'" | '"' | null = null;
            let triple: "'''" | '"""' | null = null;

            for (let i = 0; i < line.length; i += 1) {
                const ch = line[i];
                const next3 = line.slice(i, i + 3);

                if (triple) {
                    if (next3 === triple) {
                        i += 2;
                        triple = null;
                    }
                    continue;
                }

                if (quote) {
                    if (ch === "\\") {
                        i += 1;
                        continue;
                    }
                    if (ch === quote) quote = null;
                    continue;
                }

                if (next3 === "'''" || next3 === '"""') {
                    triple = next3 as "'''" | '"""';
                    i += 2;
                    continue;
                }

                if (ch === "'" || ch === '"') {
                    quote = ch as "'" | '"';
                    continue;
                }

                if (ch === "#") {
                    return line.slice(0, i);
                }
            }

            return line;
        })
        .join("\n");
}

function stripPythonStringLiterals(source: string): string {
    let out = "";
    let i = 0;

    while (i < source.length) {
        const ch = source[i];
        const next3 = source.slice(i, i + 3);

        if (next3 === "'''" || next3 === '"""') {
            const quote = next3;
            out += "   ";
            i += 3;
            while (i < source.length && source.slice(i, i + 3) !== quote) {
                out += source[i] === "\n" ? "\n" : " ";
                i += 1;
            }
            if (i < source.length) {
                out += "   ";
                i += 3;
            }
            continue;
        }

        if (ch === "'" || ch === '"') {
            const quote = ch;
            out += " ";
            i += 1;
            while (i < source.length) {
                const current = source[i];
                if (current === "\\") {
                    out += "  ";
                    i += 2;
                    continue;
                }
                out += current === "\n" ? "\n" : " ";
                i += 1;
                if (current === quote) break;
            }
            continue;
        }

        out += ch;
        i += 1;
    }

    return out;
}

function getSubmittedSourceForCheck(args: {
    check: SourceCheckInput;
    code: string;
    entry?: string;
    files?: FileEntry[];
}): string {
    const requestedPath = typeof args.check.path === "string" ? normalizeSubmittedFilePath(args.check.path) : "";
    const files = args.files ?? [];

    if (requestedPath) {
        const file = files.find((candidate) => normalizeSubmittedFilePath(candidate.path) === requestedPath);
        return typeof file?.content === "string" ? file.content : "";
    }

    if (args.entry && files.length) {
        const entryPath = normalizeSubmittedFilePath(args.entry);
        const file = files.find((candidate) => normalizeSubmittedFilePath(candidate.path) === entryPath);
        if (typeof file?.content === "string") return file.content;
    }

    return args.code;
}

function checkSourceContains(source: string, pattern: unknown, normalizeWhitespace: unknown): boolean {
    const needle = typeof pattern === "string" ? pattern : "";
    if (!needle) return false;

    const commentFree = stripPythonComments(source);

    if (normalizeWhitespace) {
        return normalizeSourceWhitespace(commentFree).includes(normalizeSourceWhitespace(needle));
    }

    return commentFree.includes(needle);
}

function checkSourceRegex(source: string, pattern: unknown): boolean {
    if (typeof pattern !== "string" || !pattern) return false;

    try {
        return new RegExp(pattern, "m").test(stripPythonComments(source));
    } catch {
        return false;
    }
}

function checkOrderedPatterns(args: {
    source: string;
    patterns: unknown;
    normalizeWhitespace?: unknown;
    treatAsRegex: boolean;
}): boolean {
    if (!Array.isArray(args.patterns) || args.patterns.length === 0) return false;

    const rawSource = stripPythonComments(args.source);
    const sourceText = args.normalizeWhitespace
        ? normalizeSourceWhitespace(rawSource)
        : rawSource;

    let cursor = 0;

    for (const item of args.patterns) {
        if (typeof item !== "string" || !item) return false;

        if (!args.treatAsRegex) {
            const needle = args.normalizeWhitespace
                ? normalizeSourceWhitespace(item)
                : item;
            const index = sourceText.indexOf(needle, cursor);
            if (index === -1) return false;
            cursor = index + needle.length;
            continue;
        }

        try {
            const regex = new RegExp(item, "m");
            const match = regex.exec(sourceText.slice(cursor));
            if (!match) return false;
            cursor += (match.index ?? 0) + match[0].length;
        } catch {
            return false;
        }
    }

    return true;
}

function checkUsesMethod(source: string, check: SourceCheckInput): boolean {
    const method = typeof check.method === "string" ? check.method.trim() : "";
    if (!method) return false;

    const target = typeof check.target === "string" ? check.target.trim() : "";
    const codeOnly = stripPythonStringLiterals(stripPythonComments(source));
    const pattern = target
        ? `\\b${escapeRegex(target)}\\s*\\.\\s*${escapeRegex(method)}\\s*\\(`
        : `\\.\\s*${escapeRegex(method)}\\s*\\(`;

    return new RegExp(pattern).test(codeOnly);
}

function checkUsesCall(source: string, check: SourceCheckInput): boolean {
    const functionName = typeof check.functionName === "string" ? check.functionName.trim() : "";
    if (!functionName) return false;

    const codeOnly = stripPythonStringLiterals(stripPythonComments(source));
    return new RegExp(`\\b${escapeRegex(functionName)}\\s*\\(`).test(codeOnly);
}

function checkUsesSubscript(source: string, check: SourceCheckInput): boolean {
    const codeOnly = stripPythonStringLiterals(stripPythonComments(source));
    const index = check.index;

    if (typeof index === "number" || typeof index === "string") {
        return new RegExp(`\\[\\s*${escapeRegex(String(index))}\\s*\\]`).test(codeOnly);
    }

    return /\[[^\]]+\]/.test(codeOnly);
}

function checkUsesForLoop(source: string, check: SourceCheckInput): boolean {
    const iterable = typeof check.iterable === "string" ? check.iterable.trim() : "";
    const codeOnly = stripPythonStringLiterals(stripPythonComments(source));
    const pattern = iterable
        ? `\\bfor\\s+[^:\\n]+\\s+in\\s+${escapeRegex(iterable)}\\s*:`
        : "\\bfor\\s+[^:\\n]+\\s+in\\s+[^:\\n]+\\s*:";

    return new RegExp(pattern).test(codeOnly);
}

function checkUsesDictKey(source: string, check: SourceCheckInput): boolean {
    const key = typeof check.key === "string" ? check.key : "";
    if (!key) return false;

    const variable = typeof check.variable === "string" ? check.variable.trim() : "";
    const commentFree = stripPythonComments(source);
    const quotedKey = `["']${escapeRegex(key)}["']`;
    const subscriptPattern = variable
        ? `\\b${escapeRegex(variable)}\\s*\\[\\s*${quotedKey}\\s*\\]`
        : `\\[\\s*${quotedKey}\\s*\\]`;
    const literalKeyPattern = `${quotedKey}\\s*:`;

    return new RegExp(subscriptPattern).test(commentFree) || new RegExp(literalKeyPattern).test(commentFree);
}

function checkUsesImport(source: string, check: SourceCheckInput): boolean {
    const moduleName = typeof check.module === "string" ? check.module.trim() : "";
    if (!moduleName) return false;

    const importName = typeof check.importName === "string" ? check.importName.trim() : "";
    const codeOnly = stripPythonStringLiterals(stripPythonComments(source));
    const modulePattern = escapeRegex(moduleName);

    if (importName) {
        const fromImport = new RegExp(
            `\\bfrom\\s+${modulePattern}\\s+import\\s+([^\\n]+\\b${escapeRegex(importName)}\\b[^\\n]*)`,
        );
        const directImport = new RegExp(`\\bimport\\s+${modulePattern}(\\s+as\\s+\\w+)?\\b`);

        return fromImport.test(codeOnly) || directImport.test(codeOnly);
    }

    return new RegExp(`\\b(from\\s+${modulePattern}\\s+import|import\\s+${modulePattern})\\b`).test(codeOnly);
}

function sourceCheckPasses(source: string, check: SourceCheckInput): boolean {
    switch (check.type) {
        case "source_contains":
            return checkSourceContains(source, check.pattern, check.normalizeWhitespace);
        case "source_contains_any":
            return Array.isArray(check.patterns)
                ? check.patterns.some((pattern) => checkSourceContains(source, pattern, check.normalizeWhitespace))
                : false;
        case "source_regex":
            return checkSourceRegex(source, check.pattern);
        case "ordered_contains":
            return checkOrderedPatterns({
                source,
                patterns: check.patterns,
                normalizeWhitespace: check.normalizeWhitespace,
                treatAsRegex: false,
            });
        case "ordered_regex":
            return checkOrderedPatterns({
                source,
                patterns: check.patterns,
                normalizeWhitespace: check.normalizeWhitespace,
                treatAsRegex: true,
            });
        case "uses_method":
            return checkUsesMethod(source, check);
        case "uses_call":
            return checkUsesCall(source, check);
        case "uses_subscript":
            return checkUsesSubscript(source, check);
        case "uses_for_loop":
            return checkUsesForLoop(source, check);
        case "uses_dict_key":
            return checkUsesDictKey(source, check);
        case "uses_import":
            return checkUsesImport(source, check);
        default:
            return false;
    }
}

function validateSourceChecks(args: {
    expected: ProgrammingExpected;
    code: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): GradeResult | null {
    const sourceChecks = getSourceChecks(args.expected);

    if (!sourceChecks.length) return null;

    for (const check of sourceChecks) {
        const source = getSubmittedSourceForCheck({
            check,
            code: args.code,
            entry: args.entry,
            files: args.files,
        });

        if (!sourceCheckPasses(source, check)) {
            const message =
                typeof check.message === "string" && check.message.trim()
                    ? check.message.trim()
                    : "Use the required code structure for this exercise.";

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
                    raw: args.showDebug ? debugRaw({ check }) : null,
                },
            };
        }
    }

    return null;
}


function getSemanticChecks(expected: ProgrammingExpected): unknown[] {
    const checks = (expected as any)?.semanticChecks;
    return Array.isArray(checks) ? checks.filter(Boolean) : [];
}

async function gradeAdditionalSemanticChecks(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): Promise<GradeResult | null> {
    const semanticChecks = getSemanticChecks(args.expected);

    if (!semanticChecks.length) {
        return null;
    }

    return gradeSemanticCodeInput({
        expected: {
            ...(args.expected as any),
            checkMode: "semantic",
            tests: [],
            semanticChecks,
        } as ProgrammingExpected,
        code: args.code,
        language: args.language,
        entry: args.entry,
        files: args.files,
        showDebug: args.showDebug,
    });
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

    const sourceValidation = validateSourceChecks({
        expected,
        code,
        entry,
        files,
        showDebug,
    });

    if (sourceValidation) {
        return sourceValidation;
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
        const semanticValidation = await gradeAdditionalSemanticChecks({
            expected,
            code,
            language,
            entry,
            files,
            showDebug,
        });

        if (semanticValidation) {
            return semanticValidation;
        }

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
