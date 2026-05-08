import type { SqlCell, SqlExpectedInput, SqlExpectedTable } from "./types";
import { makeSqlExpected } from "./types";

export function normalizeSqlCell(value: unknown): SqlCell {
    if (value == null) return null;
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return value;
    return String(value).trim();
}

export function normalizeSqlRows(rows: unknown[][]): SqlCell[][] {
    return rows.map((row) => row.map(normalizeSqlCell));
}

export function normalizeSqlTable(
    table: SqlExpectedTable,
    ignoreRowOrder = false,
): SqlExpectedTable {
    const normalized: SqlExpectedTable = {
        columns: table.columns.map(String),
        rows: normalizeSqlRows(table.rows),
    };

    if (ignoreRowOrder) {
        normalized.rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    return normalized;
}

export function sqlTablesEqual(
    left: SqlExpectedTable,
    right: SqlExpectedTable,
    ignoreRowOrder = false,
): boolean {
    return (
        JSON.stringify(normalizeSqlTable(left, ignoreRowOrder)) ===
        JSON.stringify(normalizeSqlTable(right, ignoreRowOrder))
    );
}

export function toSqlCodeTests(expected: SqlExpectedInput | unknown) {
    return makeSqlExpected(expected as SqlExpectedInput).tests;
}
