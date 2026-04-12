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

function resolveMeta(
    def: ManifestCodeInput,
    resolved: ResolvedRecipeContext,
): string | undefined {
    if (!def.showExpectedExample) return undefined;

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

function getBetterSqlite3():
    | (new (filename: string, options?: any) => {
    exec(sql: string): void;
    prepare(sql: string): {
        columns(): Array<{ name: string }>;
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

    if (!def.showExpectedExample) return null;
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
    maxRows?: number;
}): CodeExpectedExample | null {
    const { def, resolved, schemaSql, seedSql, solutionCode, maxRows = 12 } = args;

    if (!def.showExpectedExample) return null;

    const BetterSqlite3 = getBetterSqlite3();
    if (!BetterSqlite3) return null;

    const meta = resolveMeta(def, resolved);
    const db = new BetterSqlite3(":memory:");

    try {
        if (schemaSql.trim()) db.exec(schemaSql);
        if (seedSql.trim()) db.exec(seedSql);

        const stmt = db.prepare(solutionCode);
        const columns = stmt.columns().map((c) => c.name);
        const rawRows = stmt.all();

        const rows = rawRows.slice(0, maxRows).map((rowObj) =>
            columns.map((col) => normalizeCell(rowObj[col]))
        );

        return {
            kind: "sql_result",
            ...(meta ? { meta } : {}),
            columns,
            rows,
        };
    } finally {
        db.close();
    }
}