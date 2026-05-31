import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";
import type { InteractiveLanguage } from "@zoeskoul/code-contracts";
import type { SqlDialect } from "@/lib/practice/types";
import {
    makeProgrammingExpected,
    makeSqlExpected,
    toProgrammingCodeTests,
    toSqlCodeTests,
    type ProgrammingCodeTest,
    type SemanticCheck,
    type ProgrammingWorkspaceExpectations,
    type SqlExpectedTest,
    type SqlExpectedTable,
    type SqlRuntimeSpec as SharedSqlRuntimeSpec,
} from "@zoeskoul/practice-checks";

export type CodeTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
};

export type CodeExpected = {
    kind: "code_input";
    language?: string;
    tests: CodeTest[];
    stdin?: string;
    stdout?: string;
    solutionCode?: string;
};

type ProgrammingLanguage = InteractiveLanguage;

export type SqlCell = string | number | boolean | null;
export type { ProgrammingCodeTest, SemanticCheck, SqlExpectedTable };
export type SqlCodeTest = SqlExpectedTest;
export type SqlRuntimeSpec = SharedSqlRuntimeSpec;

export type SqlMakeCodeExpectedArgs = {
    kind?: "code_input";
    language: "sql";
    fixedSqlDialect?: SqlDialect;
    runtime?: SqlRuntimeSpec;
    tests?: SqlCodeTest[];
    solutionCode: string;
};

type ProgrammingCodeExpected = ReturnType<typeof makeProgrammingExpected>;
type SqlCodeExpected = ReturnType<typeof makeSqlExpected>;

export type ProgrammingMakeCodeExpectedArgs = {
    kind?: "code_input";
    language?: ProgrammingLanguage;
    checkMode?: "stdout" | "semantic";
    stdin?: string;
    stdout?: string;
    match?: "exact" | "includes";
    tests?: ProgrammingCodeTest[];
    semanticChecks?: SemanticCheck[];
    sourceChecks?: unknown[];
    workspaceExpectations?: ProgrammingWorkspaceExpectations;
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
    if (args.language === "sql") {
        return makeSqlExpected(args);
    }

    return {
        ...makeProgrammingExpected({
            language: args.language,
            checkMode: args.checkMode,
            stdin: args.stdin,
            stdout: args.stdout,
            match: args.match,
            tests: args.tests,
            semanticChecks: args.semanticChecks,
            workspaceExpectations: args.workspaceExpectations,
            solutionCode: args.solutionCode,
        }),
        ...(Array.isArray(args.sourceChecks) && args.sourceChecks.length
            ? { sourceChecks: args.sourceChecks }
            : {}),
    } as CodeExpectedInput;
}

export { toProgrammingCodeTests, toSqlCodeTests };

export function normalizeCodeExpectedForSave(
    expected: any,
): ProgrammingCodeExpected | SqlCodeExpected {
    const language =
        typeof expected?.language === "string" ? expected.language : "python";
    const solutionFiles = expected?.solutionFiles;
    const sourceChecks = Array.isArray(expected?.sourceChecks)
        ? expected.sourceChecks.filter(Boolean)
        : [];

    if (language === "sql") {
        const normalized = makeSqlExpected(expected);
        const canonTests = normalized.tests.slice(0, 12);

        if (!canonTests.length) {
            throw new Error(
                `Generator bug: SQL code_input expected is missing tests. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        const needsSolution = canonTests.some((test) => test.compareTo === "solution");
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
            ...normalized,
            tests: canonTests,
            solutionCode,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        };
    }

    const normalized = makeProgrammingExpected(expected);

    if (normalized.checkMode === "semantic") {
        if (!normalized.semanticChecks.length) {
            throw new Error(
                `Generator bug: semantic code_input expected is missing semanticChecks. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )}`,
            );
        }

        return {
            ...normalized,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        };
    }

    const canonTests = normalized.tests.slice(0, 12);

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
        ...normalized,
        tests: canonTests,
        ...(solutionFiles !== undefined ? { solutionFiles } : {}),
        ...(sourceChecks.length ? { sourceChecks } : {}),
    };
}
