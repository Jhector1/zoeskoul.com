import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";
import type { InteractiveLanguage } from "@zoeskoul/code-contracts";
import type { SqlDialect } from "@/lib/practice/types";
import {
    getShellTaskExpectedMode,
    isShellTaskExpectedLike,
    makeProgrammingExpected,
    makeShellTaskExpected,
    makeSqlExpected,
    parseCodeExpected,
    toProgrammingCodeTests,
    toSqlCodeTests,
    type ProgrammingCodeTest,
    type SemanticCheck,
    type TerminalExpectations,
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
    terminalExpectations?: TerminalExpectations;
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


function normalizeShellTaskExpectedForSave(expected: any) {
    if (!isShellTaskExpectedLike(expected)) {
        return null;
    }

    return makeShellTaskExpected({
        mode: getShellTaskExpectedMode(expected) ?? "terminal_workspace",
        workspaceExpectations:
            expected?.workspaceExpectations ??
            expected?.workspace?.workspaceExpectations,
        terminalExpectations: expected?.terminalExpectations,
        hiddenShellCheck: expected?.hiddenShellCheck,
        sourceChecks: expected?.sourceChecks,
        tests: Array.isArray(expected?.tests) ? expected.tests : undefined,
        solutionCode:
            typeof expected?.solutionCode === "string"
                ? expected.solutionCode
                : undefined,
    }) as any;
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
            terminalExpectations: args.terminalExpectations,
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

    const shellTaskExpected = normalizeShellTaskExpectedForSave(expected);

    if (shellTaskExpected) {
        return shellTaskExpected as any;
    }


    const language =
        typeof expected?.language === "string" ? expected.language : "python";
    const solutionFiles = expected?.solutionFiles;
    const sourceChecks = Array.isArray(expected?.sourceChecks)
        ? expected.sourceChecks.filter(Boolean)
        : [];
    const shellTaskMeta = isShellTaskExpectedLike(expected)
        ? {
            recipeType: "shell_task" as const,
            ...(getShellTaskExpectedMode(expected)
                ? { shellTaskMode: getShellTaskExpectedMode(expected) }
                : {}),
        }
        : {};
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

        const persisted = {
            ...normalized,
            tests: canonTests,
            solutionCode,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        };
        const parsed = parseCodeExpected(persisted);

        if (!parsed.success) {
            throw new Error(
                `Generator bug: invalid code_input expected payload. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )} parsedError=${JSON.stringify(parsed.error.format(), null, 2)}`,
            );
        }

        return {
            ...parsed.data,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        } as SqlCodeExpected;
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

        const persisted = {
            ...normalized,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        };
        const parsed = parseCodeExpected(persisted);

        if (!parsed.success) {
            throw new Error(
                `Generator bug: invalid semantic code_input expected payload. expected=${JSON.stringify(
                    expected,
                    null,
                    2,
                )} parsedError=${JSON.stringify(parsed.error.format(), null, 2)}`,
            );
        }

        return {
            ...parsed.data,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
            ...(sourceChecks.length ? { sourceChecks } : {}),
        } as ProgrammingCodeExpected;
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

    const persisted = {
        ...normalized,
        tests: canonTests,
        ...shellTaskMeta,
        ...(solutionFiles !== undefined ? { solutionFiles } : {}),
        ...(sourceChecks.length ? { sourceChecks } : {}),
    };
    const parsed = parseCodeExpected(persisted);

    if (!parsed.success) {
        throw new Error(
            `Generator bug: invalid stdout code_input expected payload. expected=${JSON.stringify(
                expected,
                null,
                2,
            )} parsedError=${JSON.stringify(parsed.error.format(), null, 2)}`,
        );
    }

    return {
        ...parsed.data,
        ...shellTaskMeta,
        ...(solutionFiles !== undefined ? { solutionFiles } : {}),
        ...(sourceChecks.length ? { sourceChecks } : {}),
    } as ProgrammingCodeExpected;
}
