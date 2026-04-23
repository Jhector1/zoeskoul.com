import type { SqlCell, SqlTable } from "./types.js";

export function normalizeSqlCell(v: unknown): SqlCell {
    if (v == null) return null;
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return v;
    return String(v).trim();
}

export function normalizeSqlTable(
    table: SqlTable,
    ignoreRowOrder = false,
): SqlTable {
    const out: SqlTable = {
        columns: table.columns.map(String),
        rows: table.rows.map((row) => row.map(normalizeSqlCell)),
    };

    if (ignoreRowOrder) {
        out.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    return out;
}