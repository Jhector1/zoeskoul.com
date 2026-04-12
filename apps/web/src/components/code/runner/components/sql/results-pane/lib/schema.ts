
import type {
    ColumnModel,
    RelationModel,
    SchemaModel,
    TableModel,
} from "../SqlResultsPane.types";

function normalizeIdent(raw: string) {
    const s = String(raw ?? "").trim();
    const unwrapped = s
        .replace(/^"(.*)"$/s, "$1")
        .replace(/^`(.*)`$/s, "$1")
        .replace(/^\[(.*)\]$/s, "$1");

    const last = unwrapped.split(".").filter(Boolean).pop() ?? unwrapped;
    return last.trim();
}

function splitTopLevel(input: string) {
    const out: string[] = [];
    let cur = "";
    let depth = 0;
    let quote: "'" | '"' | "`" | null = null;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const prev = input[i - 1];

        if (quote) {
            cur += ch;
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            cur += ch;
            continue;
        }

        if (ch === "(") {
            depth++;
            cur += ch;
            continue;
        }

        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            cur += ch;
            continue;
        }

        if (ch === "," && depth === 0) {
            if (cur.trim()) out.push(cur.trim());
            cur = "";
            continue;
        }

        cur += ch;
    }

    if (cur.trim()) out.push(cur.trim());
    return out;
}

function parseType(def: string) {
    const match = String(def).match(
        /^(.+?)(?=\s+(?:not\s+null|null|primary\s+key|references|unique|default|check|collate|constraint)\b|$)/i,
    );
    return (match?.[1] ?? def).trim();
}

export function parseSchemaSql(schemaSql?: string | null): SchemaModel {
    const text = String(schemaSql ?? "");
    if (!text.trim()) return { tables: [], relations: [] };

    const tableMap = new Map<string, TableModel>();
    const relations: RelationModel[] = [];

    const createRe =
        /create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi;

    for (const match of text.matchAll(createRe)) {
        const rawTableName = match[1] ?? "";
        const body = match[2] ?? "";
        const tableName = normalizeIdent(rawTableName);

        const table: TableModel = {
            id: tableName,
            name: tableName,
            columns: [],
        };

        const pendingPk = new Set<string>();
        const parts = splitTopLevel(body);

        for (const rawPart of parts) {
            const part = rawPart.trim();

            const tablePk = part.match(/^primary\s+key\s*\(([^)]+)\)/i);
            if (tablePk) {
                splitTopLevel(tablePk[1]).forEach((name) => {
                    pendingPk.add(normalizeIdent(name));
                });
                continue;
            }

            const tableFk = part.match(
                /^foreign\s+key\s*\(([^)]+)\)\s+references\s+([^\s(]+)\s*\(([^)]+)\)/i,
            );
            if (tableFk) {
                const fromCols = splitTopLevel(tableFk[1]).map(normalizeIdent);
                const toTable = normalizeIdent(tableFk[2]);
                const toCols = splitTopLevel(tableFk[3]).map(normalizeIdent);

                fromCols.forEach((fromCol, i) => {
                    const toCol = toCols[i] ?? toCols[0] ?? "id";
                    relations.push({
                        id: `${tableName}.${fromCol}->${toTable}.${toCol}`,
                        fromTable: tableName,
                        fromColumn: fromCol,
                        toTable,
                        toColumn: toCol,
                        fromCardinality: "many",
                        toCardinality: "1",
                        label: fromCol,
                    });
                });
                continue;
            }

            const columnMatch = part.match(
                /^("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s+([\s\S]+)$/,
            );
            if (!columnMatch) continue;

            const colName = normalizeIdent(columnMatch[1]);
            const rest = columnMatch[2].trim();
            const type = parseType(rest);
            const isPk = /\bprimary\s+key\b/i.test(rest);
            const nullable = !/\bnot\s+null\b/i.test(rest);
            const isUnique = /\bunique\b/i.test(rest);

            const refMatch = rest.match(
                /\breferences\s+([^\s(]+)\s*\(([^)]+)\)/i,
            );
            const references = refMatch
                ? {
                    table: normalizeIdent(refMatch[1]),
                    column: normalizeIdent(refMatch[2]),
                }
                : undefined;

            const column: ColumnModel = {
                name: colName,
                type,
                nullable,
                isPk,
                isFk: !!references,
                isUnique,
                references,
            };

            table.columns.push(column);

            if (references) {
                relations.push({
                    id: `${tableName}.${colName}->${references.table}.${references.column}`,
                    fromTable: tableName,
                    fromColumn: colName,
                    toTable: references.table,
                    toColumn: references.column,
                    fromCardinality: isUnique
                        ? nullable
                            ? "0..1"
                            : "1"
                        : nullable
                            ? "0..many"
                            : "many",
                    toCardinality: "1",
                    label: colName,
                });
            }
        }

        table.columns = table.columns.map((col) =>
            pendingPk.has(col.name) ? { ...col, isPk: true } : col,
        );

        tableMap.set(tableName, table);
    }

    for (const rel of relations) {
        const source = tableMap.get(rel.fromTable);
        if (!source) continue;

        source.columns = source.columns.map((col) =>
            col.name === rel.fromColumn ? { ...col, isFk: true } : col,
        );
    }

    return {
        tables: Array.from(tableMap.values()),
        relations: relations.filter(
            (rel, index, arr) =>
                tableMap.has(rel.fromTable) &&
                tableMap.has(rel.toTable) &&
                arr.findIndex((x) => x.id === rel.id) === index,
        ),
    };
}

export { normalizeIdent, splitTopLevel, parseType };
