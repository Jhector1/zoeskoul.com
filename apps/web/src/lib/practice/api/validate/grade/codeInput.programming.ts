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

type WorkspaceSubmissionEntry =
    | FileEntry
    | {
    kind: "directory";
    path: string;
};

function isDirectorySubmissionEntry(
    entry: WorkspaceSubmissionEntry,
): entry is { kind: "directory"; path: string } {
    return "kind" in entry && entry.kind === "directory";
}

function toSubmittedFileEntries(
    files?: WorkspaceSubmissionEntry[],
): FileEntry[] | undefined {
    return files?.filter(
        (file): file is FileEntry => !isDirectorySubmissionEntry(file),
    );
}

type WorkspaceExpectationInput = {
    entryFilePath?: unknown;
    requiredFiles?: unknown;
    requiredFolders?: unknown;
    forbiddenFiles?: unknown;
};

type TerminalEvidenceInput = {
    commands?: unknown;
    outputText?: unknown;
    cwd?: unknown;
};

type TerminalExpectationCommandInput = {
    pattern?: unknown;
    message?: unknown;
};

type TerminalExpectationInput = {
    requiredCommands?: unknown;
    forbiddenCommands?: unknown;
    outputContains?: unknown;
    outputRegex?: unknown;
    cwdContains?: unknown;
    cwdEndsWith?: unknown;
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
    submittedFolderPaths: Set<string>,
): boolean {
    if (submittedFolderPaths.has(folderPath)) {
        return true;
    }

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
    entry?: string;
    files?: WorkspaceSubmissionEntry[];
}): GradeResult | null {
    const expectations = args.expected
        .workspaceExpectations as WorkspaceExpectationInput | undefined;

    if (!expectations || typeof expectations !== "object") {
        return null;
    }

    const submittedFilePaths = new Set<string>();
    const submittedFolderPaths = new Set<string>();

    for (const file of args.files ?? []) {
        const normalizedPath = normalizeSubmittedFilePath(file.path);
        if (!normalizedPath) continue;

        if (isDirectorySubmissionEntry(file)) {
            submittedFolderPaths.add(normalizedPath);
            continue;
        }

        submittedFilePaths.add(normalizedPath);

        const parts = normalizedPath.split("/");
        let current = "";

        for (const part of parts.slice(0, -1)) {
            current = current ? `${current}/${part}` : part;
            submittedFolderPaths.add(current);
        }
    }

    const requiredFiles = asWorkspacePathArray(expectations.requiredFiles);
    const requiredFolders = asWorkspacePathArray(expectations.requiredFolders);
    const forbiddenFiles = asWorkspacePathArray(expectations.forbiddenFiles);
    const expectedEntryFilePath = normalizeWorkspaceExpectationPath(
        expectations.entryFilePath,
    );

    if (expectedEntryFilePath) {
        if (!submittedFilePaths.has(expectedEntryFilePath)) {
            return {
                ok: false,
                explanation: `Missing file: ${expectedEntryFilePath}`,
                feedback: null,
            };
        }

        const submittedEntryPath = normalizeSubmittedFilePath(args.entry);
        if (submittedEntryPath && submittedEntryPath !== expectedEntryFilePath) {
            return {
                ok: false,
                explanation: `Use ${expectedEntryFilePath} as the entry file.`,
                feedback: null,
            };
        }
    }

    for (const requiredFile of requiredFiles) {
        if (!submittedFilePaths.has(requiredFile)) {
            return {
                ok: false,
                explanation: `Missing file: ${requiredFile}`,
                feedback: null,
            };
        }
    }

    for (const requiredFolder of requiredFolders) {
        if (!submittedFolderExists(requiredFolder, submittedFilePaths, submittedFolderPaths)) {
            return {
                ok: false,
                explanation: `Missing folder: ${requiredFolder}`,
                feedback: null,
            };
        }
    }

    for (const forbiddenFile of forbiddenFiles) {
        if (submittedFilePaths.has(forbiddenFile)) {
            return {
                ok: false,
                explanation: `Remove forbidden file: ${forbiddenFile}`,
                feedback: null,
            };
        }
    }

    return null;
}

function createTerminalSetupError(args: {
    showDebug: boolean;
    pattern: string;
    area: "commands" | "output";
}): GradeResult {
    return {
        ok: false,
        explanation: "Validation setup error",
        feedback: {
            area: "code",
            source: "check",
            kind: "runtime",
            tone: "danger",
            title: "Validation setup error",
            message:
                "This exercise has an invalid terminal validation rule. Please tell your instructor or try another exercise.",
            raw: args.showDebug
                ? JSON.stringify(
                    {
                        issue: "invalid_terminal_expectation_regex",
                        area: args.area,
                        pattern: args.pattern,
                    },
                    null,
                    2,
                )
                : null,
        },
    };
}

function asTerminalCommandExpectations(value: unknown): TerminalExpectationCommandInput[] {
    if (!Array.isArray(value)) return [];

    return value.filter(
        (item): item is TerminalExpectationCommandInput =>
            Boolean(item) && typeof item === "object",
    );
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value.filter((item): item is string => typeof item === "string");
}

function compileExpectationRegex(args: {
    pattern: string;
    showDebug: boolean;
    area: "commands" | "output";
}): RegExp | GradeResult {
    try {
        return new RegExp(args.pattern, "m");
    } catch {
        return createTerminalSetupError(args);
    }
}

function terminalFeedback(args: {
    explanation: string;
    message: string;
    tone?: "warning" | "danger";
    raw?: string | null;
}): GradeResult {
    return {
        ok: false,
        explanation: args.explanation,
        feedback: {
            area: "code",
            source: "check",
            kind: "logic",
            tone: args.tone ?? "warning",
            title: "Not correct yet",
            message: args.message,
            raw: args.raw ?? null,
        },
    };
}

function validateTerminalExpectations(args: {
    expected: ProgrammingExpected;
    terminalEvidence?: TerminalEvidenceInput;
    showDebug: boolean;
}): GradeResult | null {
    const expectations = (args.expected as any)
        ?.terminalExpectations as TerminalExpectationInput | undefined;

    if (!expectations || typeof expectations !== "object") {
        return null;
    }

    const commands = Array.isArray(args.terminalEvidence?.commands)
        ? args.terminalEvidence?.commands
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
    const outputText = String(args.terminalEvidence?.outputText ?? "");
    const cwd =
        typeof args.terminalEvidence?.cwd === "string"
            ? args.terminalEvidence.cwd
            : "";

    for (const expectation of asTerminalCommandExpectations(
        expectations.requiredCommands,
    )) {
        const pattern = typeof expectation.pattern === "string"
            ? expectation.pattern.trim()
            : "";
        if (!pattern) continue;

        const compiled = compileExpectationRegex({
            pattern,
            showDebug: args.showDebug,
            area: "commands",
        });

        if (compiled instanceof RegExp === false) {
            return compiled;
        }

        const matched = commands.some((command) => compiled.test(command));

        if (!matched) {
            const message =
                typeof expectation.message === "string" && expectation.message.trim()
                    ? expectation.message.trim()
                    : `Run a terminal command matching: ${pattern}`;

            return terminalFeedback({
                explanation: message,
                message,
                raw: args.showDebug ? debugRaw({ kind: "requiredCommands", pattern }) : null,
            });
        }
    }

    for (const expectation of asTerminalCommandExpectations(
        expectations.forbiddenCommands,
    )) {
        const pattern = typeof expectation.pattern === "string"
            ? expectation.pattern.trim()
            : "";
        if (!pattern) continue;

        const compiled = compileExpectationRegex({
            pattern,
            showDebug: args.showDebug,
            area: "commands",
        });

        if (compiled instanceof RegExp === false) {
            return compiled;
        }

        const matched = commands.some((command) => compiled.test(command));

        if (matched) {
            const message =
                typeof expectation.message === "string" && expectation.message.trim()
                    ? expectation.message.trim()
                    : `Do not use a terminal command matching: ${pattern}`;

            return terminalFeedback({
                explanation: message,
                message,
                raw: args.showDebug ? debugRaw({ kind: "forbiddenCommands", pattern }) : null,
            });
        }
    }

    for (const requiredText of asStringArray(expectations.outputContains)) {
        if (!outputText.includes(requiredText)) {
            const message = `The terminal output should include: ${requiredText}`;

            return terminalFeedback({
                explanation: message,
                message,
                raw: args.showDebug
                    ? debugRaw({ kind: "outputContains", value: requiredText })
                    : null,
            });
        }
    }

    for (const pattern of asStringArray(expectations.outputRegex)) {
        const trimmedPattern = pattern.trim();
        if (!trimmedPattern) continue;

        const compiled = compileExpectationRegex({
            pattern: trimmedPattern,
            showDebug: args.showDebug,
            area: "output",
        });

        if (compiled instanceof RegExp === false) {
            return compiled;
        }

        if (!compiled.test(outputText)) {
            const message = `The terminal output did not match the expected pattern: ${trimmedPattern}`;

            return terminalFeedback({
                explanation: message,
                message,
                raw: args.showDebug
                    ? debugRaw({ kind: "outputRegex", pattern: trimmedPattern })
                    : null,
            });
        }
    }

    if (
        typeof expectations.cwdContains === "string" &&
        expectations.cwdContains &&
        !cwd.includes(expectations.cwdContains)
    ) {
        const message = `Run pwd after moving into a folder containing: ${expectations.cwdContains}`;

        return terminalFeedback({
            explanation: message,
            message,
            raw: args.showDebug
                ? debugRaw({ kind: "cwdContains", value: expectations.cwdContains })
                : null,
        });
    }

    if (
        typeof expectations.cwdEndsWith === "string" &&
        expectations.cwdEndsWith &&
        !cwd.endsWith(expectations.cwdEndsWith)
    ) {
        const message = `Run pwd after moving into ${expectations.cwdEndsWith}.`;

        return terminalFeedback({
            explanation: message,
            message,
            raw: args.showDebug
                ? debugRaw({ kind: "cwdEndsWith", value: expectations.cwdEndsWith })
                : null,
        });
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

function isPythonStringPrefix(value: string): boolean {
    return /^[rRuUbBfF]{0,4}$/.test(value);
}

function getPythonStringPrefixBeforeQuote(source: string, quoteIndex: number): string {
    let start = quoteIndex;

    while (start > 0 && /[A-Za-z]/.test(source[start - 1] ?? "")) {
        start -= 1;
    }

    const prefix = source.slice(start, quoteIndex);
    const hasTokenBoundary =
        start === 0 || !/[A-Za-z0-9_]/.test(source[start - 1] ?? "");

    if (!hasTokenBoundary || !isPythonStringPrefix(prefix)) return "";

    return prefix;
}

function maskPythonStringContent(args: {
    source: string;
    start: number;
    end: number;
    preserveFStringExpressions: boolean;
}): string {
    const { source, start, end, preserveFStringExpressions } = args;

    if (!preserveFStringExpressions) {
        let masked = "";
        for (let i = start; i < end; i += 1) {
            masked += source[i] === "\n" ? "\n" : " ";
        }
        return masked;
    }

    let masked = "";
    let expressionDepth = 0;

    for (let i = start; i < end; i += 1) {
        const ch = source[i];
        const next = source[i + 1];

        if (expressionDepth === 0) {
            if (ch === "{" && next === "{") {
                masked += "  ";
                i += 1;
                continue;
            }

            if (ch === "}" && next === "}") {
                masked += "  ";
                i += 1;
                continue;
            }

            if (ch === "{") {
                expressionDepth = 1;
                masked += ch;
                continue;
            }

            masked += ch === "\n" ? "\n" : " ";
            continue;
        }

        masked += ch;

        if (ch === "{") {
            expressionDepth += 1;
        } else if (ch === "}") {
            expressionDepth -= 1;
        }
    }

    return masked;
}

function stripPythonStringLiterals(source: string): string {
    let out = "";
    let i = 0;

    while (i < source.length) {
        const ch = source[i];
        const next3 = source.slice(i, i + 3);
        const isTripleQuote = next3 === "'''" || next3 === '"""';
        const isSingleQuote = ch === "'" || ch === '"';

        if (isTripleQuote || isSingleQuote) {
            const quote = isTripleQuote ? next3 : ch;
            const delimiterLength = isTripleQuote ? 3 : 1;
            const prefix = getPythonStringPrefixBeforeQuote(source, i);
            const preserveFStringExpressions = /f/i.test(prefix);

            out += " ".repeat(delimiterLength);

            const bodyStart = i + delimiterLength;
            let bodyEnd = bodyStart;

            if (isTripleQuote) {
                while (
                    bodyEnd < source.length &&
                    source.slice(bodyEnd, bodyEnd + delimiterLength) !== quote
                    ) {
                    bodyEnd += 1;
                }
            } else {
                while (bodyEnd < source.length) {
                    const current = source[bodyEnd];

                    if (current === "\\") {
                        bodyEnd += 2;
                        continue;
                    }

                    if (current === quote) break;

                    bodyEnd += 1;
                }
            }

            out += maskPythonStringContent({
                source,
                start: bodyStart,
                end: Math.min(bodyEnd, source.length),
                preserveFStringExpressions,
            });

            if (bodyEnd < source.length) {
                out += " ".repeat(delimiterLength);
                i = bodyEnd + delimiterLength;
            } else {
                i = bodyEnd;
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
    files?: WorkspaceSubmissionEntry[];
}): string {
    const requestedPath = typeof args.check.path === "string" ? normalizeSubmittedFilePath(args.check.path) : "";
    const files = toSubmittedFileEntries(args.files) ?? [];

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
        const importNamePattern = escapeRegex(importName);

        const fromImport = new RegExp(
            [
                `\\bfrom\\s+${modulePattern}\\s+import\\s+`,
                `(?:`,
                `\\([^)]*\\b${importNamePattern}\\b[^)]*\\)`,
                `|`,
                `[^\\n]*\\b${importNamePattern}\\b[^\\n]*`,
                `)`,
            ].join(""),
        );

        const directImport = new RegExp(
            `\\bimport\\s+${modulePattern}(?:\\s+as\\s+\\w+)?\\b`,
        );

        return fromImport.test(codeOnly) || directImport.test(codeOnly);
    }

    return new RegExp(
        `\\b(from\\s+${modulePattern}\\s+import|import\\s+${modulePattern})\\b`,
    ).test(codeOnly);
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
    files?: WorkspaceSubmissionEntry[];
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
    files?: WorkspaceSubmissionEntry[];
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
        files: toSubmittedFileEntries(args.files),
        showDebug: args.showDebug,
    });
}

function filesWithCurrentEntryContent(args: {
    entry?: string;
    files?: WorkspaceSubmissionEntry[];
    code: string;
}): FileEntry[] | undefined {
    const files = toSubmittedFileEntries(args.files);

    if (!args.entry || !files?.length) {
        return files;
    }

    return replaceEntryFileContent({
        entry: args.entry,
        files,
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
    terminalWorkspaceShellTask?: boolean;
    code: string;
    language: string;
    terminalEvidence?: TerminalEvidenceInput;
    entry?: string;
    files?: WorkspaceSubmissionEntry[];
    showDebug: boolean;
}): Promise<GradeResult> {
    const {
        expected,
        terminalWorkspaceShellTask,
        code,
        language,
        terminalEvidence,
        entry,
        files,
        showDebug,
    } = args;

    const workspaceValidation = validateWorkspaceExpectations({
        expected,
        entry,
        files,
    });

    if (workspaceValidation) {
        return workspaceValidation;
    }

    const terminalValidation = validateTerminalExpectations({
        expected,
        terminalEvidence,
        showDebug,
    });

    if (terminalValidation) {
        return terminalValidation;
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

    if (terminalWorkspaceShellTask) {
        // Course 1 shell tasks validate the learner's synced workspace
        // directly, so we stop here instead of requiring stdout or Judge0.
        return {
            ok: true,
            explanation: "Correct.",
            feedback: null,
        };
    }

    if (expected.checkMode === "semantic") {
        return gradeSemanticCodeInput({
            expected,
            code,
            language,
            entry,
            files: toSubmittedFileEntries(files),
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
            semanticChecks: getSemanticChecks(expected),
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
