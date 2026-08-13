import {
    runLocalSqlInProcess,
} from "./sql/localRunner.js";

export type ExpectedExample =
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
        rows: Array<
            Array<
                string |
                number |
                null
            >
        >;
      };

export type ExpectedExampleDef = {
    showExpectedExample?:
        | boolean
        | {
            metaKey?: string;
          };
};

export type ResolvedExpectedExampleContext = {
    expectedExampleMeta?: string;
    maybeT?: (
        key: string,
    ) => string | undefined;
};

type TestLike = {
    stdin?: string;
    stdout: string;
};

function shouldShowExpectedExample(
    def: ExpectedExampleDef,
): boolean {
    return def.showExpectedExample !== false;
}

function resolveMeta(
    def: ExpectedExampleDef,
    resolved: ResolvedExpectedExampleContext,
): string | undefined {
    if (!shouldShowExpectedExample(def)) {
        return undefined;
    }

    if (
        typeof def.showExpectedExample === "object" &&
        def.showExpectedExample.metaKey
    ) {
        return resolved.maybeT?.(
            def.showExpectedExample.metaKey,
        );
    }

    return resolved.expectedExampleMeta;
}

function normalizeExpectedExampleCell(
    value: unknown,
): string | number | null {
    if (value == null) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    return String(value);
}

function stripSqlComments(
    sql: string,
): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function isMutationSql(
    sql: string,
): boolean {
    const cleaned =
        stripSqlComments(sql)
            .trim()
            .toLowerCase();

    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(
        cleaned,
    );
}

export function buildTerminalExpectedExample(args: {
    def: ExpectedExampleDef;
    resolved: ResolvedExpectedExampleContext;
    tests: readonly TestLike[];
}): ExpectedExample | null {
    const {
        def,
        resolved,
        tests,
    } = args;

    if (!shouldShowExpectedExample(def)) {
        return null;
    }

    if (!tests.length) {
        return null;
    }

    const first = tests[0];

    if (!first?.stdout) {
        return null;
    }

    const meta = resolveMeta(
        def,
        resolved,
    );

    return {
        kind: "terminal",
        ...(meta ? { meta } : {}),
        ...(first.stdin
            ? { stdin: first.stdin }
            : {}),
        stdout: first.stdout,
    };
}

export function buildSqlExpectedExample(args: {
    def: ExpectedExampleDef;
    resolved: ResolvedExpectedExampleContext;
    schemaSql: string;
    seedSql: string;
    solutionCode: string;
    checkSql?: string;
    maxRows?: number;
}): ExpectedExample | null {
    const {
        def,
        resolved,
        schemaSql,
        seedSql,
        solutionCode,
        checkSql,
        maxRows = 12,
    } = args;

    if (!shouldShowExpectedExample(def)) {
        return null;
    }

    const mutation =
        isMutationSql(solutionCode);

    if (
        mutation &&
        !checkSql?.trim()
    ) {
        return null;
    }

    const execution =
        runLocalSqlInProcess({
            code: solutionCode,
            ...(mutation &&
            checkSql?.trim()
                ? {
                    checkSql:
                        checkSql.trim(),
                  }
                : {}),
            dialect: "sqlite",
            schemaSql,
            seedSql,
        });

    if (
        !execution ||
        execution.ok !== true
    ) {
        return null;
    }

    const columns =
        Array.isArray(execution.columns)
            ? execution.columns.map(String)
            : [];

    const rows =
        Array.isArray(execution.rows)
            ? execution.rows
                .slice(
                    0,
                    maxRows,
                )
                .map((row) =>
                    Array.isArray(row)
                        ? row.map(
                            normalizeExpectedExampleCell,
                        )
                        : [],
                )
            : [];

    if (!columns.length) {
        return null;
    }

    const meta = resolveMeta(
        def,
        resolved,
    );

    return {
        kind: "sql_result",
        ...(meta ? { meta } : {}),
        columns,
        rows,
    };
}
