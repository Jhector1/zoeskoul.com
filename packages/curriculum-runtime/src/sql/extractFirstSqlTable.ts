import type { SqlCell, SqlRunResult, SqlTable } from "./types.js";
import { normalizeSqlRows } from "@zoeskoul/practice-checks";

export function extractFirstSqlTable(run: SqlRunResult | null | undefined): SqlTable | null {
    const topLevelColumns = Array.isArray(run?.columns)
        ? run.columns.map((c) => (typeof c === "string" ? c : String(c?.name ?? "")))
        : null;

    const topLevelRows = Array.isArray(run?.rows) ? run.rows : null;

    if (topLevelColumns && topLevelRows) {
        return {
            columns: topLevelColumns,
            rows: normalizeSqlRows(topLevelRows),
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
        ? raw.columns.map((c) => (typeof c === "string" ? c : String(c?.name ?? "")))
        : [];

    const rows = Array.isArray(raw.rows) ? normalizeSqlRows(raw.rows) : [];

    if (!columns.length && !rows.length) return null;

    return { columns, rows };
}
