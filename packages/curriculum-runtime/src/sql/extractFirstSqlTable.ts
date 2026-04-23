import type { SqlCell, SqlRunResult, SqlTable } from "./types.js";

function normalizeSqlCell(v: unknown): SqlCell {
    if (v == null) return null;
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return v;
    return String(v).trim();
}

function normalizeRows(rows: unknown[][]): SqlCell[][] {
    return rows.map((row) => row.map(normalizeSqlCell));
}

export function extractFirstSqlTable(run: SqlRunResult | null | undefined): SqlTable | null {
    const topLevelColumns = Array.isArray(run?.columns)
        ? run.columns.map((c) => (typeof c === "string" ? c : String(c?.name ?? "")))
        : null;

    const topLevelRows = Array.isArray(run?.rows) ? run.rows : null;

    if (topLevelColumns && topLevelRows) {
        return {
            columns: topLevelColumns,
            rows: normalizeRows(topLevelRows),
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

    const rows = Array.isArray(raw.rows) ? normalizeRows(raw.rows) : [];

    if (!columns.length && !rows.length) return null;

    return { columns, rows };
}