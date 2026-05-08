export const PROGRAMMING_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
] as const;

export type ProgrammingLanguage = (typeof PROGRAMMING_LANGUAGES)[number];

export type ProgrammingStdoutMatchMode = "exact" | "includes";

export type ProgrammingCodeTest = {
    stdin?: string;
    stdout?: string;
    match?: ProgrammingStdoutMatchMode;
};

export type SemanticCheck =
    | {
        type: "defines_class";
        className: string;
        message?: string;
    }
    | {
        type: "constructible";
        className: string;
        constructorArgs?: unknown[];
        message?: string;
    }
    | {
        type: "instance_attributes";
        className: string;
        constructorArgs?: unknown[];
        attributes: string[];
        message?: string;
    }
    | {
        type: "method_returns";
        className: string;
        constructorArgs?: unknown[];
        methodName: string;
        methodArgs?: unknown[];
        expected: unknown;
        message?: string;
    }
    | {
        type: "created_instances";
        className: string;
        min?: number;
        message?: string;
    }
    | {
        type: "printed_line_count";
        min?: number;
        message?: string;
    };

export type StdoutProgrammingExpected = {
    kind: "code_input";
    strategy: "programming";
    language?: ProgrammingLanguage;
    checkMode: "stdout";
    tests: Array<Required<Pick<ProgrammingCodeTest, "stdin" | "stdout" | "match">>>;
    semanticChecks: [];
    solutionCode?: string;
};

export type SemanticProgrammingExpected = {
    kind: "code_input";
    strategy: "programming";
    language: ProgrammingLanguage;
    checkMode: "semantic";
    tests: [];
    semanticChecks: SemanticCheck[];
    solutionCode?: string;
};

export type ProgrammingExpected =
    | StdoutProgrammingExpected
    | SemanticProgrammingExpected;

export type ProgrammingExpectedInput = {
    kind?: "code_input";
    language?: ProgrammingLanguage;
    checkMode?: "stdout" | "semantic";
    stdin?: string;
    stdout?: string;
    match?: ProgrammingStdoutMatchMode;
    tests?: ProgrammingCodeTest[];
    semanticChecks?: SemanticCheck[];
    solutionCode?: string;
};

export function makeProgrammingExpected(
    input: ProgrammingExpectedInput,
): ProgrammingExpected {
    const kind = "code_input" as const;
    const checkMode = input.checkMode ?? "stdout";

    if (checkMode === "semantic") {
        return {
            kind,
            strategy: "programming",
            language: input.language ?? "python",
            checkMode: "semantic",
            tests: [],
            semanticChecks: Array.isArray(input.semanticChecks)
                ? input.semanticChecks
                : [],
            solutionCode: input.solutionCode,
        };
    }

    const tests =
        Array.isArray(input.tests) && input.tests.length > 0
            ? input.tests.map((test) => ({
                stdin: typeof test.stdin === "string" ? test.stdin : "",
                stdout: String(test.stdout ?? ""),
                match: test.match ?? "exact",
            }))
            : [
                {
                    stdin: typeof input.stdin === "string" ? input.stdin : "",
                    stdout: String(input.stdout ?? ""),
                    match: input.match ?? "exact",
                },
            ];

    return {
        kind,
        strategy: "programming",
        language: input.language,
        checkMode: "stdout",
        tests,
        semanticChecks: [],
        solutionCode: input.solutionCode,
    };
}
