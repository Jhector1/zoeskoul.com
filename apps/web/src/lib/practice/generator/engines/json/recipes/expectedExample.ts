import type { CodeExpectedExample } from "@/lib/practice/types";
import type { ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";

type ResolvedRecipeContext = {
    expectedExampleMeta?: string;
    maybeT?: (key: string) => string | undefined;
};

type TestLike = {
    stdin?: string;
    stdout: string;
};

function shouldShowExpectedExample(def: ManifestCodeInput): boolean {
    return def.showExpectedExample !== false;
}

function resolveMeta(
    def: ManifestCodeInput,
    resolved: ResolvedRecipeContext,
): string | undefined {
    if (!shouldShowExpectedExample(def)) return undefined;

    if (typeof def.showExpectedExample === "object" && def.showExpectedExample.metaKey) {
        return resolved.maybeT?.(def.showExpectedExample.metaKey);
    }

    return resolved.expectedExampleMeta;
}

function normalizeCell(value: unknown): string | number | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "boolean") return value ? 1 : 0;
    return String(value);
}

export function buildSqlResultRows(
    columns: readonly string[],
    rawRows: readonly unknown[][],
    maxRows: number,
): Array<Array<string | number | null>> {
    return rawRows.slice(0, maxRows).map((row) =>
        columns.map((_column, columnIndex) =>
            normalizeCell(row[columnIndex]),
        ),
    );
}

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function isMutationSql(sql: string): boolean {
    const cleaned = stripSqlComments(sql).trim().toLowerCase();
    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

function getBetterSqlite3():
    | (new (filename: string, options?: any) => {
    exec(sql: string): void;
    prepare(sql: string): {
        reader?: boolean;
        columns(): Array<{ name: string }>;
        raw(toggle?: boolean): {
            all(): unknown[][];
        };
        all(): Array<Record<string, unknown>>;
    };
    close(): void;
})
    | null {
    if (typeof window !== "undefined") return null;

    try {
        const req = eval("require") as NodeJS.Require;
        return req("better-sqlite3");
    } catch {
        return null;
    }
}

export function buildTerminalExpectedExample(args: {
    def: ManifestCodeInput;
    resolved: ResolvedRecipeContext;
    tests: readonly TestLike[];
}): CodeExpectedExample | null {
    const { def, resolved, tests } = args;

    if (!shouldShowExpectedExample(def)) return null;
    if (!tests.length) return null;

    const first = tests[0];
    if (!first?.stdout) return null;

    const meta = resolveMeta(def, resolved);

    return {
        kind: "terminal",
        ...(meta ? { meta } : {}),
        ...(first.stdin ? { stdin: first.stdin } : {}),
        stdout: first.stdout,
    };
}

export function buildSqlExpectedExample(args: {
    def: ManifestCodeInput;
    resolved: ResolvedRecipeContext;
    schemaSql: string;
    seedSql: string;
    solutionCode: string;
    checkSql?: string;
    maxRows?: number;
}): CodeExpectedExample | null {
    const {
        def,
        resolved,
        schemaSql,
        seedSql,
        solutionCode,
        checkSql,
        maxRows = 12,
    } = args;

    if (!shouldShowExpectedExample(def)) return null;

    const BetterSqlite3 = getBetterSqlite3();
    if (!BetterSqlite3) return null;

    const meta = resolveMeta(def, resolved);
    const db = new BetterSqlite3(":memory:");

    try {
        if (schemaSql.trim()) db.exec(schemaSql);
        if (seedSql.trim()) db.exec(seedSql);

        if (isMutationSql(solutionCode)) {
            if (!checkSql?.trim()) {
                return null;
            }

            db.exec(solutionCode);

            const checkStmt = db.prepare(checkSql);

            if (checkStmt.reader === false) {
                return null;
            }

            const columns = checkStmt.columns().map((c) => c.name);
            const rawRows = checkStmt.raw(true).all();
            const rows = buildSqlResultRows(columns, rawRows, maxRows);

            return {
                kind: "sql_result",
                ...(meta ? { meta } : {}),
                columns,
                rows,
            };
        }

        const stmt = db.prepare(solutionCode);

        if (stmt.reader === false) {
            return null;
        }

        const columns = stmt.columns().map((c) => c.name);
        const rawRows = stmt.raw(true).all();
        const rows = buildSqlResultRows(columns, rawRows, maxRows);

        return {
            kind: "sql_result",
            ...(meta ? { meta } : {}),
            columns,
            rows,
        };
    } catch {
        // Expected examples are optional UI previews.
        // They should never make /api/practice fail.
        return null;
    } finally {
        db.close();
    }
}