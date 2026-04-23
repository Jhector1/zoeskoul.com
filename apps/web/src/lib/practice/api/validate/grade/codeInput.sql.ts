import { runCode } from "@/lib/code/runCode";
import type { GradeResult } from "./codeInput.programming";
import { SqlExpected } from "@/lib/practice/api/validate/schemas";
import {
    classifySqlMissingResultTable,
    classifySqlResultMismatch,
    classifySqlRunFailure,
} from "@/lib/code/feedback";
import { getSqlDataset } from "@/lib/subjects/sql/datasets";
import {
    extractFirstSqlTable,
    sqlTablesEqual,
    validateSqlAgainstSolution,
    type SqlTable,
} from "@zoeskoul/curriculum-runtime";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

export async function gradeSqlCodeInput(args: {
    expected: SqlExpected;
    code: string;
    showDebug: boolean;
}): Promise<GradeResult> {
    const { expected, code, showDebug } = args;

    const MAX_TESTS = 12;
    const trimmed = expected.tests.slice(0, MAX_TESTS);

    for (const tc of trimmed) {
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
                        explanation: "Your query ran, but no result table could be read.",
                        feedback: classifySqlMissingResultTable("check"),
                    };
                }

                if (result.errorStage === "table_mismatch") {
                    return {
                        ok: false,
                        explanation: "Your query ran, but the returned table does not match the expected result.",
                        feedback: classifySqlResultMismatch({
                            source: "check",
                            message:
                                "Check your selected columns, filtering, sorting, grouping, and returned rows.",
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
                        explanation: "Server bug: SQL expected table is missing.",
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
            schemaSql,
            seedSql,
            datasetId,
            limits: DEFAULT_SQL_LIMITS,
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
                explanation: "Your query ran, but no result table could be read.",
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
                explanation: "Your query ran, but the returned table does not match the expected result.",
                feedback: classifySqlResultMismatch({
                    source: "check",
                    message:
                        "Check your selected columns, filtering, sorting, grouping, and returned rows.",
                }),
            };
        }
    }

    return { ok: true, explanation: "Correct.", feedback: null };
}