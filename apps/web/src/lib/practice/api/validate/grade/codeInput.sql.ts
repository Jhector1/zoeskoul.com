import { runCode } from "@/lib/code/runCode";
import { SqlExpected } from "@/lib/practice/api/validate/schemas";
import {
    classifySqlMissingResultTable,
    classifySqlResultMismatch,
    classifySqlRunFailure,
} from "@/lib/code/feedback";
import { getSqlDataset } from "@/lib/subjects/sql/sql/datasets";
import {
    extractFirstSqlTable,
    sqlTablesEqual,
    validateSqlAgainstSolution,
    type SqlTable,
} from "@zoeskoul/curriculum-runtime/sql";
import {GradeResult} from "@/lib/practice/api/validate/grade/index";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

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

function mismatchMessage(hasCheckSql: boolean) {
    return hasCheckSql
        ? "Your SQL ran, but the database state after your statement does not match the expected result."
        : "Your query ran, but the returned table does not match the expected result.";
}

function mismatchHint(hasCheckSql: boolean) {
    return hasCheckSql
        ? "Check the row you inserted, updated, or deleted. The final table state is different from the expected state."
        : "Check your selected columns, filtering, sorting, grouping, and returned rows.";
}

function missingTableMessage(hasCheckSql: boolean) {
    return hasCheckSql
        ? "Your SQL ran, but the post-check query did not return a readable result table."
        : "Your query ran, but no result table could be read.";
}

export async function gradeSqlCodeInput(args: {
    expected: SqlExpected;
    code: string;
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, showDebug } = args;

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
                learnerSql: code,
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
            const result = await validateSqlAgainstSolution({
                learnerSql: code,
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
                        explanation: missingTableMessage(hasCheckSql),
                        feedback: classifySqlMissingResultTable("check"),
                    };
                }

                if (result.errorStage === "table_mismatch") {
                    return {
                        ok: false,
                        explanation: mismatchMessage(hasCheckSql),
                        feedback: classifySqlResultMismatch({
                            source: "check",
                            message: mismatchHint(hasCheckSql),
                        }),
                    };
                }

                if (result.errorStage === "solution_run_failed") {
                    return {
                        ok: false,
                        explanation: "Server bug: the SQL solution query failed to run.",
                        feedback: null,
                    };
                }

                if (result.errorStage === "solution_table_missing") {
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

        const learnerRun = await runCode({
            kind: "sql",
            language: "sql",
            dialect: sqlDialect,
            code,
            checkSql,
            schemaSql,
            seedSql,
            datasetId,
            limits: DEFAULT_SQL_LIMITS,
            runtime,
        } as any);

        if (!learnerRun?.ok) {
            const feedback = classifySqlRunFailure(learnerRun, "check");
            return {
                ok: false,
                explanation: feedback.message,
                feedback: showDebug ? feedback : { ...feedback, raw: null },
            };
        }

        const learnerTable = extractFirstSqlTable(learnerRun);

        if (!learnerTable) {
            return {
                ok: false,
                explanation: missingTableMessage(hasCheckSql),
                feedback: classifySqlMissingResultTable("check"),
            };
        }

        const expectedTable: SqlTable | null = tc.expectedTable ?? null;

        if (!expectedTable) {
            return {
                ok: false,
                explanation: "Server bug: SQL expected table is missing.",
                feedback: null,
            };
        }

        const pass = sqlTablesEqual(
            learnerTable,
            expectedTable,
            tc.ignoreRowOrder ?? false,
        );

        if (!pass) {
            return {
                ok: false,
                explanation: mismatchMessage(hasCheckSql),
                feedback: classifySqlResultMismatch({
                    source: "check",
                    message: mismatchHint(hasCheckSql),
                }),
            };
        }
    }

    return {
        ok: true,
        explanation: "Correct.",
        feedback: null,
    };
}
