export type CodeExpectedExample =
    | {
    kind: "terminal";
    meta?: string;
    stdin?: string;
    stdout: string;
}
    | {
    kind: "sql_result";
    meta?: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
};

type ResolvedRecipeContext = {
    expectedExampleMeta?: string;
    maybeT?: (key: string) => string | undefined;
};

type TestLike = {
    stdin?: string;
    stdout: string;
};

function shouldShowExpectedExample(def: any): boolean {
    return def.showExpectedExample !== false;
}

function resolveMeta(def: any, resolved: ResolvedRecipeContext): string | undefined {
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

function getBetterSqlite3(): any | null {
    if (typeof window !== "undefined") return null;
    try {
        type RuntimeRequire = (id: string) => any;
        const req = eval("require") as RuntimeRequire;
        return req("better-sqlite3");
    } catch {
        return null;
    }
}

export function buildTerminalExpectedExample(args: {
    def: any;
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
    def: any;
    resolved: ResolvedRecipeContext;
    schemaSql: string;
    seedSql: string;
    solutionCode: string;
    maxRows?: number;
}): CodeExpectedExample | null {
    const { def, resolved, schemaSql, seedSql, solutionCode, maxRows = 12 } = args;
    if (!shouldShowExpectedExample(def)) return null;

    const BetterSqlite3 = getBetterSqlite3();
    if (!BetterSqlite3) return null;

    const meta = resolveMeta(def, resolved);
    const db = new BetterSqlite3(":memory:");

    try {
        if (schemaSql.trim()) db.exec(schemaSql);
        if (seedSql.trim()) db.exec(seedSql);

        const stmt = db.prepare(solutionCode);
        const columns = stmt.columns().map((c: { name: string }) => c.name);
        const rawRows = stmt.all();

        const rows = rawRows.slice(0, maxRows).map((rowObj: Record<string, unknown>) =>
            columns.map((col: string) => normalizeCell(rowObj[col])),
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