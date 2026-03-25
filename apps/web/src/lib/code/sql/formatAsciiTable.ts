import type { SqlScalar } from "../types";

function stringifyCell(v: SqlScalar) {
    if (v == null) return "NULL";
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
}

function crop(s: string, max = 48) {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

export function renderAsciiTable(columns: string[], rows: SqlScalar[][]) {
    if (!columns.length) return "(no columns)";
    if (!rows.length) return `${columns.join(" | ")}\n(0 rows)`;

    const widths = columns.map((col, i) => {
        let w = crop(col).length;
        for (const row of rows) {
            w = Math.max(w, crop(stringifyCell(row[i] ?? null)).length);
        }
        return Math.min(w, 48);
    });

    const line = `+-${widths.map((w) => "-".repeat(w)).join("-+-")}-+`;

    const header =
        "| " +
        columns
            .map((col, i) => crop(col).padEnd(widths[i], " "))
            .join(" | ") +
        " |";

    const body = rows.map((row) => {
        return (
            "| " +
            widths
                .map((w, i) => crop(stringifyCell(row[i] ?? null)).padEnd(w, " "))
                .join(" | ") +
            " |"
        );
    });

    return [line, header, line, ...body, line, `(${rows.length} row${rows.length === 1 ? "" : "s"})`].join("\n");
}