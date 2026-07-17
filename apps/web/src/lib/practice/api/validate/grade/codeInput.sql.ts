import { runCode } from "@/lib/code/runCode";
import { SqlExpected } from "@/lib/practice/api/validate/schemas";
import {
    classifySqlMissingResultTable,
    classifySqlResultMismatch,
    classifySqlRunFailure,
} from "@/lib/code/feedback";
import { getSqlDataset } from "@/lib/subjects/sql/sql/datasets";
import { validateSqlSubmission } from "@zoeskoul/curriculum-runtime/sql";
import {GradeResult} from "@/lib/practice/api/validate/grade/index";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

type SqlSubmissionFile =
    | { kind?: "file"; path: string; content: string }
    | { kind: "directory"; path: string };

type SqlSourceCheck = {
    type?: unknown;
    pattern?: unknown;
    message?: unknown;
    path?: unknown;
    normalizeWhitespace?: unknown;
};

type SqlTaskKind = "schema" | "mutation" | "query";

type SqlSourceCheckValidationResult =
    | { ok: true }
    | {
          ok: false;
          kind: "setup";
          setupError: string;
      }
    | {
          ok: false;
          kind: "learner";
          message: string;
          path: string | null;
      };

const DEFAULT_SQL_FILE_ORDER = [
    "schema.sql",
    "seed.sql",
    "operations.sql",
    "query.sql",
] as const;

function normalizeSql(sql: string | undefined | null): string {
    return String(sql ?? "").trim();
}

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function startsWithMutation(sql: string | undefined | null): boolean {
    const cleaned = stripSqlComments(String(sql ?? "")).trim().toLowerCase();
    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function sourceChecks(value: unknown): SqlSourceCheck[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (entry): entry is SqlSourceCheck =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    );
}

function canonicalSqlPathRank(path: string): number {
    const index = DEFAULT_SQL_FILE_ORDER.indexOf(
        path as (typeof DEFAULT_SQL_FILE_ORDER)[number],
    );
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function composeSqlWorkspaceSubmission(args: {
    code: string;
    entry?: string;
    files?: SqlSubmissionFile[];
    sqlFileOrder?: string[];
}) {
    const fileEntries = (args.files ?? []).filter(
        (file): file is Extract<SqlSubmissionFile, { content: string }> =>
            file.kind !== "directory" &&
            typeof (file as { content?: unknown }).content === "string",
    );

    if (!fileEntries.length) {
        return {
            sql: args.code,
            filesByPath: new Map<string, string>(),
            missingFiles: [] as string[],
            usedWorkspace: false,
        };
    }

    const filesByPath = new Map(
        fileEntries.map((file) => [file.path, file.content]),
    );

    if (args.entry && filesByPath.has(args.entry) && args.code.trim()) {
        filesByPath.set(args.entry, args.code);
    }

    const authoredOrder = stringArray(args.sqlFileOrder);
    const order = authoredOrder.length
        ? authoredOrder
        : [...filesByPath.keys()].sort(
              (left, right) =>
                  canonicalSqlPathRank(left) - canonicalSqlPathRank(right) ||
                  left.localeCompare(right),
          );
    const missingFiles = order.filter((path) => !filesByPath.has(path));
    const sql = order
        .filter((path) => filesByPath.has(path))
        .map((path) => `-- file: ${path}\n${filesByPath.get(path) ?? ""}`)
        .join("\n\n");

    return { sql, filesByPath, missingFiles, usedWorkspace: true };
}

function validateSqlSourceChecks(args: {
    checks: SqlSourceCheck[];
    compositeSql: string;
    filesByPath: Map<string, string>;
}): SqlSourceCheckValidationResult {
    for (const check of args.checks) {
        if (check.type !== "source_regex") continue;
        const pattern = typeof check.pattern === "string" ? check.pattern : "";
        if (!pattern) continue;
        const path = typeof check.path === "string" ? check.path.trim() : "";
        const source = path ? args.filesByPath.get(path) ?? "" : args.compositeSql;

        let regex: RegExp;
        try {
            regex = new RegExp(pattern);
        } catch {
            return {
                ok: false,
                kind: "setup",
                setupError:
                    "Server bug: this exercise contains an invalid SQL source-check pattern.",
            };
        }

        const normalizedSource =
            check.normalizeWhitespace === true
                ? source.replace(/\s+/g, "")
                : source;
        if (!regex.test(normalizedSource)) {
            const message =
                typeof check.message === "string" && check.message.trim()
                    ? check.message.trim()
                    : path
                      ? `Complete the required SQL in ${path}.`
                      : "Complete every required SQL step before checking.";
            return {
                ok: false,
                kind: "learner",
                message,
                path: path || null,
            };
        }
    }
    return { ok: true };
}

function sqlTaskKind(args: {
    learnerSql: string;
    solutionSql?: string;
}): SqlTaskKind {
    const cleaned = stripSqlComments(
        `${args.learnerSql}\n${args.solutionSql ?? ""}`,
    );
    if (/\b(?:create|alter|drop)\s+(?:table|index|view)\b/i.test(cleaned)) {
        return "schema";
    }
    if (/\b(?:insert|update|delete|replace)\b/i.test(cleaned)) {
        return "mutation";
    }
    return "query";
}

function mutationNeedsCheckSql(args: {
    learnerSql: string;
    solutionSql?: string;
    checkSql?: string;
}) {
    if (normalizeSql(args.checkSql)) return false;

    return (
        startsWithMutation(args.learnerSql) ||
        startsWithMutation(args.solutionSql)
    );
}

function mismatchTitle(taskKind: SqlTaskKind) {
    if (taskKind === "schema") return "Schema result is not correct";
    if (taskKind === "mutation") return "Database change is not correct";
    return "Query result is not correct";
}

function mismatchMessage(args: {
    hasCheckSql: boolean;
    taskKind: SqlTaskKind;
}) {
    if (args.taskKind === "schema") {
        return "Your SQL ran, but the created table or constraints do not match the expected schema.";
    }
    if (args.taskKind === "mutation") {
        return "Your SQL ran, but the database state after the requested change does not match the expected result.";
    }
    return args.hasCheckSql
        ? "Your SQL ran, but the verification result does not match the expected result."
        : "Your query ran, but the returned table does not match the expected result.";
}

function mismatchHint(taskKind: SqlTaskKind) {
    if (taskKind === "schema") {
        return "Check schema.sql for the requested table name, columns, data types, and constraints. Then confirm query.sql inspects that exact table.";
    }
    if (taskKind === "mutation") {
        return "Check the required INSERT, UPDATE, or DELETE in operations.sql and the preview or verification SELECT in query.sql.";
    }
    return "Check the SELECT or PRAGMA in query.sql, including its selected columns, filters, and target object.";
}

function missingTableMessage(args: {
    hasCheckSql: boolean;
    taskKind: SqlTaskKind;
}) {
    if (args.taskKind === "schema") {
        return "Your SQL ran, but the schema inspection did not return a readable result table.";
    }
    if (args.taskKind === "mutation") {
        return "Your SQL ran, but the post-change verification did not return a readable result table.";
    }
    return args.hasCheckSql
        ? "Your SQL ran, but the verification query did not return a readable result table."
        : "Your query ran, but no result table could be read.";
}

export async function gradeSqlCodeInput(args: {
    expected: SqlExpected;
    code: string;
    entry?: string;
    files?: SqlSubmissionFile[];
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, entry, files, showDebug } = args;

    const expectedRecord = expected as SqlExpected & {
        sqlFileOrder?: unknown;
        sourceChecks?: unknown;
        workspaceExpectations?: { requiredFiles?: unknown };
    };
    const authoredOrder = stringArray(expectedRecord.sqlFileOrder);
    const requiredFiles = stringArray(
        expectedRecord.workspaceExpectations?.requiredFiles,
    );
    const workspace = composeSqlWorkspaceSubmission({
        code,
        entry,
        files,
        sqlFileOrder: authoredOrder.length ? authoredOrder : requiredFiles,
    });
    const learnerSql = workspace.sql;
    const taskKind = sqlTaskKind({
        learnerSql,
        solutionSql: expected.solutionCode,
    });

    if (workspace.missingFiles.length) {
        const missing = workspace.missingFiles.join(", ");
        return {
            ok: false,
            explanation: `Required SQL workspace file(s) are missing: ${missing}.`,
            feedback: {
                area: "code",
                source: "check",
                kind: "logic",
                tone: "warning",
                title: "Required SQL file is missing",
                message: `Restore ${missing} and complete the requested work in each file before checking.`,
                line: null,
                column: null,
                raw: null,
            },
        };
    }

    const sourceCheckResult = validateSqlSourceChecks({
        checks: sourceChecks(expectedRecord.sourceChecks),
        compositeSql: learnerSql,
        filesByPath: workspace.filesByPath,
    });
    if (!sourceCheckResult.ok) {
        if (sourceCheckResult.kind === "setup") {
            return {
                ok: false,
                explanation: sourceCheckResult.setupError,
                feedback: null,
            };
        }
        return {
            ok: false,
            explanation: sourceCheckResult.message,
            feedback: {
                area: "code",
                source: "check",
                kind: "logic",
                tone: "warning",
                title: "Required SQL step is missing",
                message: sourceCheckResult.message,
                line: null,
                column: null,
                raw: null,
            },
        };
    }

    const MAX_TESTS = 12;
    const tests = expected.tests.slice(0, MAX_TESTS);

    for (const tc of tests) {
        const datasetId =
            tc.runtime?.datasetId ??
            expected.runtime?.datasetId ??
            undefined;

        const dataset = datasetId ? getSqlDataset(datasetId) : null;

        const schemaSql =
            tc.schemaSql ??
            expected.schemaSql ??
            dataset?.schemaSql ??
            "";

        const seedSql =
            tc.seedSql ??
            expected.seedSql ??
            dataset?.seedSql ??
            "";

        const sqlDialect =
            tc.sqlDialect ??
            expected.fixedSqlDialect ??
            "sqlite";

        const runtime =
            tc.runtime ??
            expected.runtime ?? {
                kind: "sql" as const,
                resultShape: "table" as const,
            };

        const checkSql = normalizeSql(tc.checkSql);
        const hasCheckSql = Boolean(checkSql);

        if (
            mutationNeedsCheckSql({
                learnerSql,
                solutionSql: expected.solutionCode,
                checkSql,
            })
        ) {
            return {
                ok: false,
                explanation:
                    "Server bug: this SQL data-change exercise needs a checkSql query to verify the database state after the statement runs.",
                feedback: null,
            };
        }

        if ((tc.compareTo ?? "solution") === "solution") {
            const result = await validateSqlSubmission({
                learnerSql,
                compareTo: "solution",
                solutionSql: expected.solutionCode!,
                dialect: sqlDialect,
                schemaSql,
                seedSql,
                datasetId,
                ignoreRowOrder: tc.ignoreRowOrder ?? false,
                limits: DEFAULT_SQL_LIMITS,
                runSql: async (sqlArgs) =>
                    runCode({
                        kind: "sql",
                        language: "sql",
                        dialect: sqlArgs.dialect,
                        code: sqlArgs.code,
                        checkSql,
                        schemaSql: sqlArgs.schemaSql,
                        seedSql: sqlArgs.seedSql,
                        datasetId: sqlArgs.datasetId,
                        limits: sqlArgs.limits,
                        runtime,
                    } as any),
            });

            if (!result.ok) {
                if (result.errorStage === "learner_run_failed") {
                    const feedback = classifySqlRunFailure(result.learnerRun, "check");
                    return {
                        ok: false,
                        explanation: feedback.message,
                        feedback: showDebug ? feedback : { ...feedback, raw: null },
                    };
                }

                if (result.errorStage === "learner_table_missing") {
                    return {
                        ok: false,
                        explanation: missingTableMessage({
                        hasCheckSql,
                        taskKind,
                    }),
                        feedback: classifySqlMissingResultTable("check"),
                    };
                }

                if (result.errorStage === "table_mismatch") {
                    return {
                        ok: false,
                        explanation: mismatchMessage({
                            hasCheckSql,
                            taskKind,
                        }),
                        feedback: classifySqlResultMismatch({
                            source: "check",
                            title: mismatchTitle(taskKind),
                            message: mismatchHint(taskKind),
                        }),
                    };
                }

                if (result.errorStage === "reference_run_failed") {
                    return {
                        ok: false,
                        explanation: "Server bug: the SQL solution query failed to run.",
                        feedback: null,
                    };
                }

                if (result.errorStage === "reference_table_missing") {
                    return {
                        ok: false,
                        explanation: hasCheckSql
                            ? "Server bug: the SQL post-check query did not return a readable table."
                            : "Server bug: SQL expected table is missing.",
                        feedback: null,
                    };
                }

                return {
                    ok: false,
                    explanation: result.message ?? "SQL validation failed.",
                    feedback: null,
                };
            }

            continue;
        }

        const expectedTable = tc.expectedTable ?? null;

        if (!expectedTable) {
            return {
                ok: false,
                explanation: "Server bug: SQL expected table is missing.",
                feedback: null,
            };
        }

        const result = await validateSqlSubmission({
            learnerSql,
            compareTo: "expected_table",
            expectedTable,
            dialect: sqlDialect,
            schemaSql,
            seedSql,
            datasetId,
            ignoreRowOrder: tc.ignoreRowOrder ?? false,
            limits: DEFAULT_SQL_LIMITS,
            runSql: async (sqlArgs) =>
                runCode({
                    kind: "sql",
                    language: "sql",
                    dialect: sqlArgs.dialect,
                    code: sqlArgs.code,
                    checkSql,
                    schemaSql: sqlArgs.schemaSql,
                    seedSql: sqlArgs.seedSql,
                    datasetId: sqlArgs.datasetId,
                    limits: sqlArgs.limits,
                    runtime,
                } as any),
        });

        if (!result.ok) {
            if (result.errorStage === "learner_run_failed") {
                const feedback = classifySqlRunFailure(result.learnerRun, "check");
                return {
                    ok: false,
                    explanation: feedback.message,
                    feedback: showDebug ? feedback : { ...feedback, raw: null },
                };
            }

            if (result.errorStage === "learner_table_missing") {
                return {
                    ok: false,
                    explanation: missingTableMessage({
                            hasCheckSql,
                            taskKind,
                        }),
                    feedback: classifySqlMissingResultTable("check"),
                };
            }

            if (result.errorStage === "table_mismatch") {
                return {
                    ok: false,
                    explanation: mismatchMessage({
                        hasCheckSql,
                        taskKind,
                    }),
                    feedback: classifySqlResultMismatch({
                        source: "check",
                        title: mismatchTitle(taskKind),
                        message: mismatchHint(taskKind),
                    }),
                };
            }

            return {
                ok: false,
                explanation: result.message ?? "SQL validation failed.",
                feedback: null,
            };
        }
    }

    return {
        ok: true,
        explanation: "Correct.",
        feedback: null,
    };
}
