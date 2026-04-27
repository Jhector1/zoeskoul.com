export function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function stripSqlStringLiterals(sql: string): string {
    return String(sql ?? "")
        .replace(/'([^']|'')*'/g, " ")
        .replace(/"([^"]|"")*"/g, " ");
}

export function stripSqlCommentsAndStrings(sql: string): string {
    return stripSqlStringLiterals(stripSqlComments(sql));
}

export function findMatchingParen(sql: string, openIndex: number): number {
    let depth = 0;
    let quote: "'" | '"' | "`" | null = null;
    let bracket = false;

    for (let i = openIndex; i < sql.length; i += 1) {
        const ch = sql[i];
        const prev = sql[i - 1];

        if (quote) {
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }

        if (bracket) {
            if (ch === "]") bracket = false;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            continue;
        }

        if (ch === "[") {
            bracket = true;
            continue;
        }

        if (ch === "(") depth += 1;

        if (ch === ")") {
            depth -= 1;
            if (depth === 0) return i;
        }
    }

    return -1;
}

export function findStatementEnd(sql: string, fromIndex: number): number {
    let quote: "'" | '"' | "`" | null = null;
    let bracket = false;

    for (let i = fromIndex; i < sql.length; i += 1) {
        const ch = sql[i];
        const prev = sql[i - 1];

        if (quote) {
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }

        if (bracket) {
            if (ch === "]") bracket = false;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            continue;
        }

        if (ch === "[") {
            bracket = true;
            continue;
        }

        if (ch === ";") return i + 1;
    }

    return sql.length;
}

const SQL_IDENTIFIER =
    '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)?)';
export function removeCreateTableStatementsForReferenceScan(sql: string): string {
    const source = stripSqlComments(sql);

    const createTablePattern = new RegExp(
        String.raw`\bcreate\s+(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?${SQL_IDENTIFIER}\s*\(`,
        "gi",
    );

    let result = "";
    let cursor = 0;

    for (;;) {
        const match = createTablePattern.exec(source);
        if (!match) break;

        const statementStart = match.index;
        const openParenIndex = createTablePattern.lastIndex - 1;
        const closeParenIndex = findMatchingParen(source, openParenIndex);

        if (closeParenIndex < 0) break;

        const statementEnd = findStatementEnd(source, closeParenIndex + 1);

        result += source.slice(cursor, statementStart);
        result += " ";

        cursor = statementEnd;
        createTablePattern.lastIndex = statementEnd;
    }

    result += source.slice(cursor);

    return result;
}

export function removeAlterAddColumnStatementsForReferenceScan(sql: string): string {
    const pattern = new RegExp(
        String.raw`\balter\s+table\s+${SQL_IDENTIFIER}\s+add\s+(?:column\s+)?${SQL_IDENTIFIER}\b[^;]*(?:;|$)`,
        "gi",
    );

    return String(sql ?? "").replace(pattern, " ");
}

export function removeAlterRenameColumnStatementsForReferenceScan(sql: string): string {
    const pattern = new RegExp(
        String.raw`\balter\s+table\s+${SQL_IDENTIFIER}\s+rename\s+(?:column\s+)?${SQL_IDENTIFIER}\s+to\s+${SQL_IDENTIFIER}\b[^;]*(?:;|$)`,
        "gi",
    );

    return String(sql ?? "").replace(pattern, " ");
}

export function removeAlterRenameTableStatementsForReferenceScan(sql: string): string {
    const pattern = new RegExp(
        String.raw`\balter\s+table\s+${SQL_IDENTIFIER}\s+rename\s+to\s+${SQL_IDENTIFIER}\b[^;]*(?:;|$)`,
        "gi",
    );

    return String(sql ?? "").replace(pattern, " ");
}

export function removeDropColumnStatementsForReferenceScan(sql: string): string {
    const pattern = new RegExp(
        String.raw`\balter\s+table\s+${SQL_IDENTIFIER}\s+drop\s+(?:column\s+)?${SQL_IDENTIFIER}\b[^;]*(?:;|$)`,
        "gi",
    );

    return String(sql ?? "").replace(pattern, " ");
}

/**
 * Removes SQL statements where identifiers are declarations or schema changes,
 * not normal existing-column references.
 *
 * Examples:
 *
 * CREATE TABLE product_warranties (...)
 * ALTER TABLE products ADD COLUMN discount REAL;
 * ALTER TABLE products RENAME COLUMN name TO n;
 * ALTER TABLE products RENAME TO archived_products;
 * ALTER TABLE products DROP COLUMN old_col;
 *
 * In these statements, many identifiers are new names or DDL keywords.
 * The execution validator should catch invalid DDL. The dataset reference
 * scanner should not treat those identifiers as missing dataset columns.
 */
export function prepareSqlForExistingColumnReferenceScan(sql: string): string {
    let out = String(sql ?? "");

    out = removeCreateTableStatementsForReferenceScan(out);
    out = removeAlterAddColumnStatementsForReferenceScan(out);
    out = removeAlterRenameColumnStatementsForReferenceScan(out);
    out = removeAlterRenameTableStatementsForReferenceScan(out);
    out = removeDropColumnStatementsForReferenceScan(out);

    return out;
}