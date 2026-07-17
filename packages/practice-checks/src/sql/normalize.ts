import type { SqlCell, SqlExpectedInput, SqlExpectedTable } from "./types.js";
import { makeSqlExpected } from "./types.js";

export const DEFAULT_SQL_ABSOLUTE_TOLERANCE = 1e-9;
export const DEFAULT_SQL_RELATIVE_TOLERANCE = 1e-12;
export const DEFAULT_SQL_DISPLAY_SIGNIFICANT_DIGITS = 15;

export type SqlDisplayFormatOptions = {
    significantDigits?: number;
};

export type SqlTableComparisonOptions = {
    absoluteTolerance?: number;
    relativeTolerance?: number;
};

/**
 * Formats SQL cell values consistently across learner results and authored
 * expected-result previews. Numeric values are presentation-normalized only;
 * grading continues to use the tolerance-aware comparison helpers below.
 */
export function formatSqlDisplayValue(
    value: unknown,
    options: SqlDisplayFormatOptions = {},
): string {
    if (value == null) return "NULL";
    if (typeof value === "boolean") return value ? "true" : "false";

    if (typeof value === "number") {
        if (!Number.isFinite(value)) return String(value);
        if (Object.is(value, -0)) return "0";
        if (Number.isInteger(value)) return String(value);

        const significantDigits = Math.min(21, Math.max(1,
            options.significantDigits ?? DEFAULT_SQL_DISPLAY_SIGNIFICANT_DIGITS,
        ));
        const normalized = Number(value.toPrecision(significantDigits));
        return Object.is(normalized, -0) ? "0" : String(normalized);
    }

    return String(value);
}

export function normalizeSqlCell(value: unknown): SqlCell {
    if (value == null) return null;
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return value;
    return String(value).trim();
}

export function normalizeSqlRows(rows: unknown[][]): SqlCell[][] {
    return rows.map((row) => row.map(normalizeSqlCell));
}

/**
 * Canonicalizes SQL definition text returned by SQLite metadata tables.
 *
 * sqlite_master.sql preserves the learner's original whitespace, indentation,
 * punctuation spacing, and keyword casing. Those presentation differences
 * must not make an otherwise equivalent CREATE TABLE answer fail.
 *
 * Quoted strings and quoted identifiers are preserved exactly so defaults
 * such as 'active' and 'ACTIVE' do not become equivalent accidentally.
 */
export function normalizeSqlDefinitionText(value: string): string {
    const sql = String(value ?? "");
    let result = "";
    let pendingSpace = false;
    let quote: "'" | '"' | "`" | "]" | null = null;

    const appendPendingSpace = (nextCharacter: string) => {
        if (!pendingSpace || result.length === 0) return;

        const previousCharacter = result[result.length - 1] ?? "";
        const punctuation = "(),;=.";

        if (
            !punctuation.includes(previousCharacter) &&
            !punctuation.includes(nextCharacter)
        ) {
            result += " ";
        }
        pendingSpace = false;
    };

    for (let index = 0; index < sql.length; index += 1) {
        const character = sql[index] ?? "";
        const nextCharacter = sql[index + 1] ?? "";

        if (quote) {
            result += character;

            if (quote === "]") {
                if (character === "]") quote = null;
                continue;
            }

            if (character === quote) {
                if (
                    (quote === "'" || quote === '"') &&
                    nextCharacter === quote
                ) {
                    result += nextCharacter;
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (character === "-" && nextCharacter === "-") {
            index += 2;
            while (
                index < sql.length &&
                sql[index] !== "\n" &&
                sql[index] !== "\r"
            ) {
                index += 1;
            }
            pendingSpace = true;
            continue;
        }

        if (character === "/" && nextCharacter === "*") {
            index += 2;
            while (
                index < sql.length - 1 &&
                !(sql[index] === "*" && sql[index + 1] === "/")
            ) {
                index += 1;
            }
            index += 1;
            pendingSpace = true;
            continue;
        }

        if (
            character === "'" ||
            character === '"' ||
            character === "`"
        ) {
            appendPendingSpace(character);
            quote = character;
            result += character;
            continue;
        }

        if (character === "[") {
            appendPendingSpace(character);
            quote = "]";
            result += character;
            continue;
        }

        if (/\s/.test(character)) {
            pendingSpace = true;
            continue;
        }

        if ("(),;=.".includes(character)) {
            result = result.replace(/\s+$/g, "");
            result += character;
            pendingSpace = false;
            continue;
        }

        appendPendingSpace(character);
        result += character.toLowerCase();
    }

    return result
        .replace(/\s+$/g, "")
        .replace(/;+$/g, "");
}

function normalizeSqlCellForColumn(
    value: unknown,
    column: string,
): SqlCell {
    const normalized = normalizeSqlCell(value);

    if (
        typeof normalized === "string" &&
        column.trim().toLowerCase() === "sql"
    ) {
        return normalizeSqlDefinitionText(normalized);
    }

    return normalized;
}

export function normalizeSqlTable(
    table: SqlExpectedTable,
    ignoreRowOrder = false,
): SqlExpectedTable {
    const columns = table.columns.map(String);
    const normalized: SqlExpectedTable = {
        columns,
        rows: table.rows.map((row) =>
            row.map((value, index) =>
                normalizeSqlCellForColumn(
                    value,
                    columns[index] ?? "",
                ),
            ),
        ),
    };

    if (ignoreRowOrder) {
        normalized.rows.sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b)),
        );
    }

    return normalized;
}

export function sqlNumbersEqual(
    left: number,
    right: number,
    options: SqlTableComparisonOptions = {},
): boolean {
    if (Object.is(left, right)) return true;
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;

    const absoluteTolerance =
        options.absoluteTolerance ?? DEFAULT_SQL_ABSOLUTE_TOLERANCE;
    const relativeTolerance =
        options.relativeTolerance ?? DEFAULT_SQL_RELATIVE_TOLERANCE;
    const difference = Math.abs(left - right);
    const scale = Math.max(Math.abs(left), Math.abs(right));

    return difference <= Math.max(absoluteTolerance, relativeTolerance * scale);
}

export function sqlCellsEqual(
    left: SqlCell,
    right: SqlCell,
    options: SqlTableComparisonOptions = {},
): boolean {
    if (typeof left === "number" && typeof right === "number") {
        return sqlNumbersEqual(left, right, options);
    }

    return Object.is(left, right);
}

function sqlRowsEqual(
    left: SqlCell[],
    right: SqlCell[],
    options: SqlTableComparisonOptions,
): boolean {
    if (left.length !== right.length) return false;

    return left.every((cell, index) =>
        sqlCellsEqual(cell, right[index] ?? null, options),
    );
}

function unorderedSqlRowsEqual(
    leftRows: SqlCell[][],
    rightRows: SqlCell[][],
    options: SqlTableComparisonOptions,
): boolean {
    if (leftRows.length !== rightRows.length) return false;

    const usedRightRows = new Set<number>();

    for (const leftRow of leftRows) {
        const matchingIndex = rightRows.findIndex(
            (rightRow, index) =>
                !usedRightRows.has(index) &&
                sqlRowsEqual(leftRow, rightRow, options),
        );

        if (matchingIndex < 0) return false;
        usedRightRows.add(matchingIndex);
    }

    return true;
}

export function sqlTablesEqual(
    left: SqlExpectedTable,
    right: SqlExpectedTable,
    ignoreRowOrder = false,
    options: SqlTableComparisonOptions = {},
): boolean {
    const normalizedLeft = normalizeSqlTable(left);
    const normalizedRight = normalizeSqlTable(right);

    if (normalizedLeft.columns.length !== normalizedRight.columns.length) {
        return false;
    }

    if (
        !normalizedLeft.columns.every(
            (column, index) => column === normalizedRight.columns[index],
        )
    ) {
        return false;
    }

    if (ignoreRowOrder) {
        return unorderedSqlRowsEqual(
            normalizedLeft.rows,
            normalizedRight.rows,
            options,
        );
    }

    if (normalizedLeft.rows.length !== normalizedRight.rows.length) {
        return false;
    }

    return normalizedLeft.rows.every((row, index) =>
        sqlRowsEqual(row, normalizedRight.rows[index] ?? [], options),
    );
}

export function toSqlCodeTests(expected: SqlExpectedInput | unknown) {
    return makeSqlExpected(expected as SqlExpectedInput).tests;
}
