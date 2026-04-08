// src/lib/practice/api/validate/grade/codeInput.sql.ts
import { runCode } from "@/lib/code/runCode";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import type { GradeResult } from "./codeInput.programming";
import {SqlExpected} from "@/lib/practice/api/validate/schemas";
import {classifySqlMissingResultTable, classifySqlResultMismatch, classifySqlRunFailure} from "@/lib/code/feedback";
import {getSqlDataset} from "@/lib/subjects/sql/datasets";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

type SqlCell = string | number | boolean | null;
type SqlTable = {
    columns: string[];
    rows: SqlCell[][];
};

function normalizeSqlCell(v: unknown): SqlCell {
    if (v == null) return null;
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return v;
    return String(v).trim();
}

function normalizeSqlTable(table: SqlTable, ignoreRowOrder = false): SqlTable {
    const out: SqlTable = {
        columns: table.columns.map(String),
        rows: table.rows.map((row) => row.map(normalizeSqlCell)),
    };

    if (ignoreRowOrder) {
        out.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    return out;
}

function sqlTablesEqual(a: SqlTable, b: SqlTable, ignoreRowOrder = false) {
    return (
        JSON.stringify(normalizeSqlTable(a, ignoreRowOrder)) ===
        JSON.stringify(normalizeSqlTable(b, ignoreRowOrder))
    );
}

function extractFirstSqlTable(run: any): SqlTable | null {
    const topLevelColumns = Array.isArray(run?.columns)
        ? run.columns.map((c: any) =>
            typeof c === "string" ? c : String(c?.name ?? "")
        )
        : null;

    const topLevelRows = Array.isArray(run?.rows) ? run.rows : null;

    if (topLevelColumns && topLevelRows) {
        return {
            columns: topLevelColumns,
            rows: topLevelRows,
        };
    }

    const raw =
        run?.tables?.[0] ??
        run?.result?.tables?.[0] ??
        run?.sql?.statements?.[0]?.table ??
        run?.output?.tables?.[0] ??
        null;

    if (!raw) return null;

    const columns = Array.isArray(raw.columns)
        ? raw.columns.map((c: any) =>
            typeof c === "string" ? c : String(c?.name ?? "")
        )
        : [];

    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    if (!columns.length && !rows.length) return null;

    return { columns, rows };
}
function sqlMismatchFeedback(message: string): CodeFeedback {
    return {
        area: "code",
        source: "check",
        kind: "logic",
        tone: "warning",
        title: "Query result is not correct",
        message,
    };
}

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
        console.log(88888888,datasetId)

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

        console.log(88888888,learnerRun)

        if (!learnerRun?.ok) {
            const feedback = classifySqlRunFailure(learnerRun, "check");          return {
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

        let expectedTable: SqlTable | null = null;

        if ((tc.compareTo ?? "solution") === "solution") {
            const solutionRun = await runCode({
                language: "sql",
                code: expected.solutionCode!,
                limits: DEFAULT_SQL_LIMITS,
                dialect: sqlDialect,
                runtime,

                schemaSql,
                seedSql,
                datasetId,

            } as any);

            if (!solutionRun?.ok) {
                return {
                    ok: false,
                    explanation: "Server bug: the SQL solution query failed to run.",
                    feedback: null,
                };
            }

            expectedTable = extractFirstSqlTable(solutionRun);
        } else {
            expectedTable = tc.expectedTable ?? null;
        }

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
        console.log("[gradeSqlCodeInput] learnerTable", learnerTable);
        console.log("[gradeSqlCodeInput] expectedTable", expectedTable);
        console.log("[gradeSqlCodeInput] pass", pass);
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