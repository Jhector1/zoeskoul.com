import { PracticeKind } from "@zoeskoul/db";

function toNumberGrid(x: any): number[][] | null {
    if (!x) return null;

    if (typeof x?.toArray === "function") x = x.toArray();
    if (x && Array.isArray(x.data) && Array.isArray(x.data[0])) x = x.data;

    if (!Array.isArray(x) || !Array.isArray(x[0])) return null;

    const grid = x.map((row: any[]) => row.map((v: any) => Number(v)));

    if (!grid.length || !grid[0].length) return null;
    if (grid.some((r) => r.length !== grid[0].length)) return null;
    if (grid.some((r) => r.some((v) => !Number.isFinite(v)))) return null;

    return grid;
}



type ProgrammingCodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

type ProgrammingCodeExpected = {
    kind: "code_input";
    language?: string;
    tests: ProgrammingCodeTest[];
    stdin?: string;
    stdout?: string;
    solutionCode?: string;
};

type SqlCell = string | number | boolean | null;

type SqlExpectedTable = {
    columns: string[];
    rows: SqlCell[][];
};

type SqlCodeTest = {
    kind: "sql";
    sqlDialect?: "sqlite" | "postgres" | "mysql" | "mssql";
    runtime?: {
        kind: "sql";
        datasetId?: string;
        resultShape?: "table";
    };
    compareTo: "solution" | "expected_table";
    expectedTable?: SqlExpectedTable;
    match: "table_exact";
    ignoreRowOrder: boolean;
    // NEW
    checkSql?: string;
};

type SqlCodeExpected = {
    kind: "code_input";
    language: "sql";
    fixedSqlDialect?: "sqlite" | "postgres" | "mysql" | "mssql";
    runtime?: {
        kind: "sql";
        datasetId?: string;
        resultShape?: "table";
    };
    tests: SqlCodeTest[];
    solutionCode?: string;
};

function toProgrammingCodeTests(expected: any): ProgrammingCodeTest[] {
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
            .filter((t: ProgrammingCodeTest) => t.stdout.length > 0);
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

function toSqlCodeTests(expected: any): SqlCodeTest[] {
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

function normalizeCodeExpectedForSave(
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


export function normalizeExpectedForSave(kind: PracticeKind, expected: any) {
    if (kind === PracticeKind.drag_reorder) {
        const orderRaw =
            expected?.order ??
            expected?.tokenIds ??
            expected?.ids ??
            expected?.correct ??
            null;

        const order =
            Array.isArray(orderRaw) ? orderRaw.map((x: any) => String(x?.id ?? x)) : [];

        if (!order.length) {
            throw new Error(
                `Generator bug: drag_reorder expected missing order/tokenIds. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        return {
            ...(expected ?? {}),
            kind: "drag_reorder",
            order,
        };
    }

    if (kind === PracticeKind.matrix_input) {
        const raw =
            expected?.values ??
            expected?.value ??
            expected?.matrix ??
            expected?.A ??
            expected?.grid;

        const grid = toNumberGrid(raw);

        if (!grid) {
            throw new Error(
                `Generator bug: matrix_input expected is missing 2D values. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        return {
            ...(expected ?? {}),
            kind: "matrix_input",
            values: grid,
        };
    }

    if (kind === PracticeKind.code_input) {
        return normalizeCodeExpectedForSave(expected);
    }

    if (
        kind === PracticeKind.text_input ||
        kind === PracticeKind.word_bank_arrange ||
        kind === PracticeKind.listen_build ||
        kind === PracticeKind.fill_blank_choice
    ) {
        const match = expected?.match === "includes" ? "includes" : "exact";

        const rawAnswers = Array.isArray(expected?.answers)
            ? expected.answers
            : Array.isArray(expected?.acceptable)
                ? expected.acceptable
                : typeof expected?.value === "string"
                    ? [expected.value]
                    : typeof expected?.correct === "string"
                        ? [expected.correct]
                        : null;

        const answers: string[] = [];

        for (const x of rawAnswers ?? []) {
            const s = String(x ?? "").trim();
            if (!s) continue;
            if (answers.some((a) => a.toLowerCase() === s.toLowerCase())) continue;
            answers.push(s);
            if (answers.length >= 12) break;
        }

        if (!answers.length) {
            throw new Error(
                `Generator bug: ${String(kind)} expected missing answers/value. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        return {
            ...(expected ?? {}),
            kind: String(kind),
            answers,
            match,
            value: typeof expected?.value === "string" ? expected.value : answers[0],
        };
    }

    return expected;
}
