import type { InteractiveLanguage } from "@zoeskoul/code-contracts";
import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";
import type { SqlDialect, WorkspaceLanguage } from "@/lib/practice/types";

export type CodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

export type CodeExpected = {
    kind: "code_input";
    language?: WorkspaceLanguage;
    tests: CodeTest[];
    stdin?: string;
    stdout?: string;
    solutionCode?: string;
};

type ProgrammingLanguage = InteractiveLanguage;

export type ProgrammingCodeTest = {
    stdin?: string;
    stdout?: string;
    match?: "exact" | "includes";
};

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

export type SqlCodeTest = {
    kind?: "sql";
    sqlDialect?: SqlDialect;
    runtime?: SqlRuntimeSpec;
    compareTo?: "solution" | "expected_table";
    expectedTable?: SqlExpectedTable;
    match?: "table_exact";
    ignoreRowOrder?: boolean;
    checkSql?: string;
};

export type ProgrammingMakeCodeExpectedArgs = {
    kind?: "code_input";
    language?: ProgrammingLanguage;
    stdin?: string;
    stdout?: string;
    match?: "exact" | "includes";
    tests?: ProgrammingCodeTest[];
    solutionCode?: string;
};

export type SqlMakeCodeExpectedArgs = {
    kind?: "code_input";
    language: "sql";
    fixedSqlDialect?: SqlDialect;
    runtime?: SqlRuntimeSpec;
    tests?: SqlCodeTest[];
    solutionCode: string;
};

type ProgrammingCodeExpected = {
    kind: "code_input";
    language?: string;
    tests: ProgrammingCodeTest[];
    stdin?: string;
    stdout?: string;
    solutionCode?: string;
};

type SqlCodeExpected = {
    kind: "code_input";
    language: "sql";
    fixedSqlDialect?: "sqlite" | "postgres" | "mysql" | "mssql";
    runtime?: SqlRuntimeSpec;
    tests: Array<SqlCodeTest & { kind: "sql" }>;
    solutionCode?: string;
};

export function terminalFence(stdin: string, stdout: string) {
    return String.raw`~~~terminal
$ input
${stdin.trimEnd()}

$ output
${stdout.trimEnd()}
~~~`;
}

export function makeCodeExpected(args: ProgrammingMakeCodeExpectedArgs): CodeExpectedInput;
export function makeCodeExpected(args: SqlMakeCodeExpectedArgs): CodeExpectedInput;

export function makeCodeExpected(
    args: ProgrammingMakeCodeExpectedArgs | SqlMakeCodeExpectedArgs,
): CodeExpectedInput {
    const kind = "code_input" as const;

    if (args.language === "sql") {
        const fixedSqlDialect = args.fixedSqlDialect ?? "sqlite";

        const runtime =
            args.runtime ??
            ({
                kind: "sql",
                resultShape: "table",
            } satisfies SqlRuntimeSpec);

        const tests: SqlCodeTest[] =
            Array.isArray(args.tests) && args.tests.length > 0
                ? args.tests.map((t) => ({
                    kind: "sql",
                    sqlDialect: t.sqlDialect ?? fixedSqlDialect,
                    runtime: t.runtime ?? runtime,
                    compareTo: t.compareTo ?? "solution",
                    expectedTable: t.expectedTable,
                    match: t.match ?? "table_exact",
                    ignoreRowOrder: t.ignoreRowOrder ?? false,
                    checkSql:
                        typeof t.checkSql === "string" && t.checkSql.trim()
                            ? t.checkSql.trim()
                            : undefined,
                }))
                : [
                    {
                        kind: "sql",
                        sqlDialect: fixedSqlDialect,
                        runtime,
                        compareTo: "solution",
                        match: "table_exact",
                        ignoreRowOrder: false,
                    },
                ];

        return {
            kind,
            language: "sql",
            fixedSqlDialect,
            runtime,
            tests,
            solutionCode: args.solutionCode,
        };
    }

    const language: ProgrammingLanguage = args.language ?? "python";

    const tests: ProgrammingCodeTest[] =
        Array.isArray(args.tests) && args.tests.length > 0
            ? args.tests.map((t) => ({
                stdin: typeof t.stdin === "string" ? t.stdin : "",
                stdout: String(t.stdout ?? ""),
                match: t.match ?? "exact",
            }))
            : [
                {
                    stdin: typeof args.stdin === "string" ? args.stdin : "",
                    stdout: String(args.stdout ?? ""),
                    match: args.match ?? "exact",
                },
            ];

    return {
        kind,
        language,
        tests,
        stdin:
            typeof args.stdin === "string"
                ? args.stdin
                : tests[0]?.stdin ?? "",
        stdout:
            typeof args.stdout === "string"
                ? args.stdout
                : tests[0]?.stdout ?? "",
        solutionCode:
            typeof args.solutionCode === "string" ? args.solutionCode : undefined,
    };
}

export function toProgrammingCodeTests(expected: any): ProgrammingCodeTest[] {
    const rawTests =
        Array.isArray(expected?.tests) && expected.tests.length ? expected.tests : null;

    if (rawTests) {
        return rawTests
            .map((t: any) => {
                const match: ProgrammingCodeTest["match"] =
                    t?.match === "includes" ? "includes" : "exact";

                return {
                    stdin: typeof t?.stdin === "string" ? t.stdin : "",
                    stdout: String(t?.stdout ?? ""),
                    match,
                };
            })
            .filter((t: ProgrammingCodeTest) => String(t.stdout ?? "").length > 0);
    }

    const match: ProgrammingCodeTest["match"] =
        expected?.match === "includes" ? "includes" : "exact";

    return [
        {
            stdin: typeof expected?.stdin === "string" ? expected.stdin : "",
            stdout: String(expected?.stdout ?? ""),
            match,
        },
    ].filter((t) => t.stdout.length > 0);
}

export function toSqlCodeTests(expected: any): Array<SqlCodeTest & { kind: "sql" }> {
    const rawTests =
        Array.isArray(expected?.tests) && expected.tests.length ? expected.tests : null;

    if (!rawTests) return [];

    return rawTests.map((t: any) => ({
        kind: "sql",
        sqlDialect:
            t?.sqlDialect === "postgres" ||
            t?.sqlDialect === "mysql" ||
            t?.sqlDialect === "mssql" ||
            t?.sqlDialect === "sqlite"
                ? t.sqlDialect
                : expected?.fixedSqlDialect === "postgres" ||
                  expected?.fixedSqlDialect === "mysql" ||
                  expected?.fixedSqlDialect === "mssql" ||
                  expected?.fixedSqlDialect === "sqlite"
                    ? expected.fixedSqlDialect
                    : "sqlite",
        runtime:
            t?.runtime?.kind === "sql" || expected?.runtime?.kind === "sql"
                ? {
                    kind: "sql",
                    datasetId:
                        typeof t?.runtime?.datasetId === "string"
                            ? t.runtime.datasetId
                            : typeof expected?.runtime?.datasetId === "string"
                                ? expected.runtime.datasetId
                                : undefined,
                    resultShape:
                        t?.runtime?.resultShape === "table" ||
                        expected?.runtime?.resultShape === "table"
                            ? "table"
                            : "table",
                }
                : undefined,
        compareTo: t?.compareTo === "expected_table" ? "expected_table" : "solution",
        expectedTable:
            t?.expectedTable &&
            Array.isArray(t.expectedTable.columns) &&
            Array.isArray(t.expectedTable.rows)
                ? {
                    columns: t.expectedTable.columns.map(String),
                    rows: t.expectedTable.rows,
                }
                : undefined,
        match: "table_exact",
        ignoreRowOrder: Boolean(t?.ignoreRowOrder),
        checkSql:
            typeof t?.checkSql === "string" && t.checkSql.trim()
                ? t.checkSql.trim()
                : undefined,
    }));
}

export function normalizeCodeExpectedForSave(
    expected: any,
): ProgrammingCodeExpected | SqlCodeExpected {
    const language =
        typeof expected?.language === "string" ? expected.language : "python";

    if (language === "sql") {
        const tests = toSqlCodeTests(expected);
        const canonTests = tests.slice(0, 12);

        if (!canonTests.length) {
            throw new Error(
                `Generator bug: SQL code_input expected is missing tests. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        const needsSolution = canonTests.some((t) => t.compareTo === "solution");
        const solutionCode =
            typeof expected?.solutionCode === "string" ? expected.solutionCode : undefined;

        if (needsSolution && !solutionCode?.trim()) {
            throw new Error(
                `Generator bug: SQL code_input expected is missing solutionCode. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        return {
            ...(expected ?? {}),
            kind: "code_input",
            language: "sql",
            fixedSqlDialect:
                expected?.fixedSqlDialect === "postgres" ||
                expected?.fixedSqlDialect === "mysql" ||
                expected?.fixedSqlDialect === "mssql" ||
                expected?.fixedSqlDialect === "sqlite"
                    ? expected.fixedSqlDialect
                    : "sqlite",
            runtime:
                expected?.runtime?.kind === "sql"
                    ? {
                        kind: "sql",
                        datasetId:
                            typeof expected.runtime.datasetId === "string"
                                ? expected.runtime.datasetId
                                : undefined,
                        resultShape:
                            expected.runtime.resultShape === "table" ? "table" : "table",
                    }
                    : undefined,
            tests: canonTests,
            solutionCode,
        };
    }

    const tests = toProgrammingCodeTests(expected);
    const canonTests = tests.slice(0, 12);

    if (!canonTests.length) {
        throw new Error(
            `Generator bug: code_input expected is missing tests/stdout. expected=${JSON.stringify(
                expected,
                null,
                2,
            )}`,
        );
    }

    return {
        ...(expected ?? {}),
        kind: "code_input",
        language,
        tests: canonTests,
        stdin:
            typeof expected?.stdin === "string"
                ? expected.stdin
                : canonTests[0]?.stdin ?? "",
        stdout:
            typeof expected?.stdout === "string"
                ? expected.stdout
                : canonTests[0]?.stdout ?? "",
        solutionCode:
            typeof expected?.solutionCode === "string"
                ? expected.solutionCode
                : undefined,
    };
}
