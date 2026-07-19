// src/lib/practice/api/validate/grade/codeInput.semantic.python.ts
import { runCode } from "@/lib/code/runCode";
import type { FileEntry } from "@/lib/code/types";
import { isTextWorkspaceFileEntry } from "@zoeskoul/code-contracts";
import { replaceEntryFileContent } from "@/lib/code/workspaceSubmission";
import type { GradeResult } from "@/lib/practice/api/validate/grade/index";
import type { ProgrammingExpected } from "@/lib/practice/api/validate/schemas";
import {
    asSemanticChecks,
    normalizeSemanticCheckPath,
    type SemanticCheckRecord,
} from "@/lib/practice/semanticCheckPaths";
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

function isVariableEqualsCheck(check: unknown): check is SemanticCheckRecord {
    return (
        Boolean(check) &&
        typeof check === "object" &&
        !Array.isArray(check) &&
        (check as SemanticCheckRecord).type === "variable_equals"
    );
}

function normalizeExpectedKind(value: unknown): string {
    const raw = typeof value === "string" ? value.trim() : "json";
    return raw === "value" ? "json" : raw;
}

function normalizeVariableEqualsChecks(
    checks: SemanticCheckRecord[],
): SemanticCheckRecord[] {
    return checks.map((check) => ({
        ...check,
        expectedKind: normalizeExpectedKind(check.expectedKind),
    }));
}

function buildPythonVariableEqualsHarness(args: {
    userCode: string;
    checks: SemanticCheckRecord[];
}): string {
    return `
import contextlib
import io
import json
import traceback

__zoe_user_code = ${JSON.stringify(args.userCode)}
__zoe_checks = ${JSON.stringify(normalizeVariableEqualsChecks(args.checks))}
__zoe_result = {"ok": True, "errors": [], "userStdout": ""}
__zoe_globals = {"__name__": "__main__"}
__zoe_stdout = io.StringIO()

def __zoe_jsonable(value):
    if isinstance(value, tuple):
        return [__zoe_jsonable(item) for item in value]
    if isinstance(value, list):
        return [__zoe_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): __zoe_jsonable(val) for key, val in value.items()}
    return value

def __zoe_check_variable_equals(check):
    name = check.get("name")
    expected = check.get("expected")
    expected_kind = check.get("expectedKind") or "json"

    if not isinstance(name, str) or not name:
        return "Invalid variable_equals check: missing variable name."

    if name not in __zoe_globals:
        return f"Variable {name} was not defined."

    actual = __zoe_globals[name]

    if expected_kind == "dict_entries":
        if not isinstance(actual, dict):
            return f"Variable {name} should be a dictionary."
        try:
            actual_dict = dict(actual)
            expected_dict = dict(expected)
        except Exception:
            return f"Variable {name} could not be compared as a dictionary."
        if actual_dict != expected_dict:
            return f"Variable {name} should equal {expected!r}, but it was {actual!r}."
        return None

    if __zoe_jsonable(actual) != expected:
        return f"Variable {name} should equal {expected!r}, but it was {actual!r}."

    return None

try:
    with contextlib.redirect_stdout(__zoe_stdout):
        exec(compile(__zoe_user_code, "<user_code>", "exec"), __zoe_globals)
except Exception as exc:
    __zoe_result["ok"] = False
    __zoe_result["errors"].append(f"Your code raised {type(exc).__name__}: {exc}")
    __zoe_result["traceback"] = traceback.format_exc()
else:
    for __zoe_check in __zoe_checks:
        __zoe_error = __zoe_check_variable_equals(__zoe_check)
        if __zoe_error:
            __zoe_result["ok"] = False
            __zoe_result["errors"].append(__zoe_error)

__zoe_result["userStdout"] = __zoe_stdout.getvalue()
print("__ZOE_SEMANTIC_RESULT__" + json.dumps(__zoe_result, default=str))
`;
}

type SemanticCheckGroup = {
    path: string | null;
    source: string;
    checks: SemanticCheckRecord[];
};

type ResolveCheckGroupsResult =
    | { groups: SemanticCheckGroup[]; error?: never }
    | { groups?: never; error: GradeResult };

function filesWithCurrentEntry(args: {
    code: string;
    entry?: string;
    files?: FileEntry[];
}): FileEntry[] | undefined {
    if (!args.entry || !args.files?.length) return args.files;

    return replaceEntryFileContent({
        entry: args.entry,
        files: args.files,
        content: args.code,
    });
}

function resolveSemanticCheckGroups(args: {
    checks: SemanticCheckRecord[];
    code: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): ResolveCheckGroupsResult {
    const currentFiles = filesWithCurrentEntry(args) ?? [];
    const normalizedEntry = normalizeSemanticCheckPath(args.entry);
    const groups: SemanticCheckGroup[] = [];

    for (const [index, check] of args.checks.entries()) {
        const rawPath = typeof check.path === "string" ? check.path.trim() : "";
        const path = normalizeSemanticCheckPath(rawPath);

        if (rawPath && !path) {
            return {
                error: {
                    ok: false,
                    explanation: "This exercise has an invalid validation path.",
                    feedback: {
                        area: "code",
                        source: "check",
                        kind: "runtime",
                        tone: "danger",
                        title: "Validation setup error",
                        message:
                            "This exercise has an unsafe semantic-check file path. Fix the authored validation contract.",
                        raw: args.showDebug
                            ? debugRaw({ index, path: rawPath })
                            : null,
                    },
                },
            };
        }

        let source = args.code;

        if (path) {
            if (normalizedEntry === path) {
                source = args.code;
            } else {
                const file = currentFiles.find(
                    (candidate) =>
                        normalizeSemanticCheckPath(candidate.path) === path,
                );

                if (!file || !isTextWorkspaceFileEntry(file)) {
                    return {
                        error: {
                            ok: false,
                            explanation: `Missing text source file: ${path}`,
                            feedback: {
                                area: "code",
                                source: "check",
                                kind: "logic",
                                tone: "warning",
                                title: "Source file unavailable",
                                message: `Create or restore the text source file ${path}, then check your answer again.`,
                                raw: args.showDebug
                                    ? debugRaw({
                                          index,
                                          path,
                                          binary: Boolean(file),
                                      })
                                    : null,
                            },
                        },
                    };
                }

                source = file.content;
            }
        }

        const groupPath = path || null;
        const previous = groups.at(-1);

        if (previous?.path === groupPath) {
            previous.checks.push(check);
            continue;
        }

        groups.push({
            path: groupPath,
            source,
            checks: [check],
        });
    }

    return { groups };
}

async function runSemanticHarness(args: {
    harness: string;
    code: string;
    entry?: string;
    files?: FileEntry[];
    sourcePath: string | null;
    showDebug: boolean;
}): Promise<GradeResult | null> {
    const currentFiles = filesWithCurrentEntry(args);
    const run = await runCode({
        language: "python",
        ...(args.entry && currentFiles?.length
            ? {
                  entry: args.entry,
                  files: replaceEntryFileContent({
                      entry: args.entry,
                      files: currentFiles,
                      content: args.harness,
                  }),
              }
            : {
                  code: args.harness,
              }),
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
                raw: args.showDebug
                    ? debugRaw({ sourcePath: args.sourcePath, run })
                    : null,
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
                raw: args.showDebug
                    ? debugRaw({ sourcePath: args.sourcePath, run })
                    : null,
            },
        };
    }

    if (!parsed.ok) {
        const errors = parsed.errors.filter(Boolean);
        const message =
            errors[0] ?? "Your code does not satisfy the exercise yet.";

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
                          sourcePath: args.sourcePath,
                          errors,
                          userStdout: parsed.userStdout,
                      })
                    : null,
            },
        };
    }

    return null;
}

async function gradeCheckGroups(args: {
    checks: SemanticCheckRecord[];
    code: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
    buildHarness: (args: {
        userCode: string;
        checks: SemanticCheckRecord[];
    }) => string;
}): Promise<GradeResult | null> {
    if (!args.checks.length) return null;

    const resolved = resolveSemanticCheckGroups(args);

    if (resolved.error) return resolved.error;

    for (const group of resolved.groups) {
        const result = await runSemanticHarness({
            harness: args.buildHarness({
                userCode: group.source,
                checks: group.checks,
            }),
            code: args.code,
            entry: args.entry,
            files: args.files,
            sourcePath: group.path,
            showDebug: args.showDebug,
        });

        if (result) return result;
    }

    return null;
}

export async function gradePythonSemanticCodeInput(args: {
    expected: ProgrammingExpected;
    code: string;
    language: string;
    entry?: string;
    files?: FileEntry[];
    showDebug: boolean;
}): Promise<GradeResult> {
    const semanticChecks = asSemanticChecks(
        (args.expected as any).semanticChecks,
    );
    const variableEqualsChecks = semanticChecks.filter(isVariableEqualsCheck);
    const remainingSemanticChecks = semanticChecks.filter(
        (check) => !isVariableEqualsCheck(check),
    );

    const variableEqualsResult = await gradeCheckGroups({
        checks: variableEqualsChecks,
        code: args.code,
        entry: args.entry,
        files: args.files,
        showDebug: args.showDebug,
        buildHarness: buildPythonVariableEqualsHarness,
    });

    if (variableEqualsResult) return variableEqualsResult;

    const semanticResult = await gradeCheckGroups({
        checks: remainingSemanticChecks,
        code: args.code,
        entry: args.entry,
        files: args.files,
        showDebug: args.showDebug,
        buildHarness: ({ userCode, checks }) =>
            buildPythonSemanticHarness({
                userCode,
                semanticChecks: checks as any,
            }),
    });

    if (semanticResult) return semanticResult;

    return {
        ok: true,
        explanation: "Correct.",
        feedback: null,
    };
}
