export const SQL_DIALECTS = [
    "sqlite",
    "postgres",
    "mysql",
    "mssql",
] as const;

export type SqlDialect = (typeof SQL_DIALECTS)[number];
export type SqlCell = string | number | boolean | null;

export type SqlExpectedTable = {
    columns: string[];
    rows: SqlCell[][];
};

export type SqlRuntimeSpec = {
    kind: "sql";
    datasetId?: string;
    resultShape?: "table";
};

export type SqlExpectedTest = {
    kind?: "sql";
    sqlDialect?: SqlDialect;
    schemaSql?: string;
    seedSql?: string;
    runtime?: SqlRuntimeSpec;
    compareTo?: "solution" | "expected_table";
    expectedTable?: SqlExpectedTable;
    match?: "table_exact";
    ignoreRowOrder?: boolean;
    checkSql?: string;
};

export type SqlExpected = {
    kind: "code_input";
    strategy: "sql";
    language: "sql";
    fixedSqlDialect?: SqlDialect;
    schemaSql?: string;
    seedSql?: string;
    runtime?: SqlRuntimeSpec;
    tests: Array<SqlExpectedTest & { kind: "sql" }>;
    solutionCode?: string;
};

export type SqlExpectedInput = {
    kind?: "code_input";
    language?: "sql";
    fixedSqlDialect?: SqlDialect;
    schemaSql?: string;
    seedSql?: string;
    runtime?: SqlRuntimeSpec;
    tests?: SqlExpectedTest[];
    solutionCode?: string;
};

export function makeSqlExpected(input: SqlExpectedInput): SqlExpected {
    const fixedSqlDialect = input.fixedSqlDialect ?? "sqlite";
    const runtime =
        input.runtime ??
        ({
            kind: "sql",
            resultShape: "table",
        } satisfies SqlRuntimeSpec);

    const tests =
        Array.isArray(input.tests) && input.tests.length > 0
            ? input.tests.map((test) => ({
                kind: "sql" as const,
                sqlDialect: test.sqlDialect ?? fixedSqlDialect,
                schemaSql: test.schemaSql,
                seedSql: test.seedSql,
                runtime: test.runtime ?? runtime,
                compareTo: test.compareTo ?? "solution",
                expectedTable: test.expectedTable,
                match: "table_exact" as const,
                ignoreRowOrder: test.ignoreRowOrder ?? false,
                checkSql:
                    typeof test.checkSql === "string" && test.checkSql.trim()
                        ? test.checkSql.trim()
                        : undefined,
            }))
            : [
                {
                    kind: "sql" as const,
                    sqlDialect: fixedSqlDialect,
                    runtime,
                    compareTo: "solution" as const,
                    match: "table_exact" as const,
                    ignoreRowOrder: false,
                },
            ];

    return {
        kind: "code_input",
        strategy: "sql",
        language: "sql",
        fixedSqlDialect,
        schemaSql: input.schemaSql,
        seedSql: input.seedSql,
        runtime,
        tests,
        solutionCode: input.solutionCode,
    };
}
