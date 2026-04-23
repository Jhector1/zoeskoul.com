import type { SqlTable } from "./types.js";
import { normalizeSqlTable } from "./normalizeSqlTable.js";

export function sqlTablesEqual(
    a: SqlTable,
    b: SqlTable,
    ignoreRowOrder = false,
) {
    return (
        JSON.stringify(normalizeSqlTable(a, ignoreRowOrder)) ===
        JSON.stringify(normalizeSqlTable(b, ignoreRowOrder))
    );
}