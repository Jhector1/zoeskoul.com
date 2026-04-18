// src/lib/practice/generator/engines/python/python_shared/_shared.ts
import { PracticePurpose } from "@prisma/client";

import type { CodeInputExercise, CodeLanguage, SingleChoiceExercise } from "../../../types";
import type { TopicContext } from "../../generatorTypes";
import type { RNG } from "../../shared/rng";
import {
    makeSubjectModuleGenerator,
    type SubjectModuleGenerator,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";

/* -------------------------------- random helpers -------------------------------- */

export function pickWord(rng: RNG) {
    return rng.pick(["piano", "tacos", "coding", "soccer", "mystery", "coffee"] as const);
}

export function pickName(rng: RNG) {
    return rng.pick(["alex", "sam", "jordan", "taylor", "maria", "leo", "maya"] as const);
}

export function safeInt(rng: RNG, lo: number, hi: number) {
    return rng.int(lo, hi);
}

export function pickSnakeCandidate(rng: RNG) {
    return rng.pick(["user_name", "total_score", "my_var", "age_years", "first_name"] as const);
}

/* -------------------------------- code expected -------------------------------- */

export type CodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

export type CodeExpected = {
    kind: "code_input";
    language?: CodeLanguage;
    tests: CodeTest[];
    stdin?: string;
    stdout?: string;
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

import type {  SqlDialect } from "@/lib/practice/types";
import {CodeExpectedInput} from "@/lib/practice/api/validate/schemas";
import {InteractiveLanguage} from "@zoeskoul/code-contracts";
// import type { CodeExpectedInput } from "@/lib/practice/schemas";

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
};

type ProgrammingMakeCodeExpectedArgs = {
    kind?: "code_input";
    language?: ProgrammingLanguage;
    stdin?: string;
    stdout?: string;
    match?: "exact" | "includes";
    tests?: ProgrammingCodeTest[];
    solutionCode?: string;
};

type SqlMakeCodeExpectedArgs = {
    kind?: "code_input";
    language: "sql";
    fixedSqlDialect?: SqlDialect;
    runtime?: SqlRuntimeSpec;
    tests?: SqlCodeTest[];
    solutionCode: string;
};

export function makeCodeExpected(
    args: ProgrammingMakeCodeExpectedArgs,
): CodeExpectedInput;
export function makeCodeExpected(
    args: SqlMakeCodeExpectedArgs,
): CodeExpectedInput;

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
                : (tests[0]?.stdin ?? ""),
        stdout:
            typeof args.stdout === "string"
                ? args.stdout
                : (tests[0]?.stdout ?? ""),
        solutionCode:
            typeof args.solutionCode === "string" ? args.solutionCode : undefined,
    };
}

/* -------------------------------- module wrapper -------------------------------- */

export function makePythonModuleGenerator(args: {
    engineName: string;
    ctx: TopicContext;
    topics: readonly TopicBundle[];
    defaultPurpose?: PracticePurpose;
    enablePurpose?: boolean;
}): SubjectModuleGenerator {
    return makeSubjectModuleGenerator(args);
}

/* -------------------------------- re-exports -------------------------------- */

export type { SingleChoiceExercise, CodeInputExercise, CodeLanguage, TopicBundle };