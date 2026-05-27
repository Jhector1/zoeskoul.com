export const PROGRAMMING_LANGUAGES = [
    "python",
    "java",
    "javascript",
    "c",
    "cpp",
] as const;

export type ProgrammingLanguage = (typeof PROGRAMMING_LANGUAGES)[number];

export type ProgrammingStdoutMatchMode = "exact" | "includes";

export type ProgrammingCodeFile = {
    path: string;
    content: string;
    readOnly?: boolean;
};

export type ProgrammingCodeTest = {
    stdin?: string;
    stdout?: string;
    match?: ProgrammingStdoutMatchMode;
    files?: ProgrammingCodeFile[];
};

export type NormalizedProgrammingCodeTest = {
    stdin: string;
    stdout: string;
    match: ProgrammingStdoutMatchMode;
    files?: ProgrammingCodeFile[];
};

export type ProgrammingWorkspaceExpectations = {
    entryFilePath?: string;
    requiredFiles?: string[];
    requiredFolders?: string[];
    forbiddenFiles?: string[];
};

export type SemanticCheck =
    | {
    type: "function_returns";
    functionName: string;
    args?: unknown[];
    expected: unknown;
    message?: string;
}
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
    tests: NormalizedProgrammingCodeTest[];
    semanticChecks: [];
    workspaceExpectations?: ProgrammingWorkspaceExpectations;
    solutionCode?: string;
};

export type SemanticProgrammingExpected = {
    kind: "code_input";
    strategy: "programming";
    language: ProgrammingLanguage;
    checkMode: "semantic";
    tests: [];
    semanticChecks: SemanticCheck[];
    workspaceExpectations?: ProgrammingWorkspaceExpectations;
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
    workspaceExpectations?: ProgrammingWorkspaceExpectations;
    solutionCode?: string;
};

function normalizeTestFiles(
    files: ProgrammingCodeFile[] | undefined,
): ProgrammingCodeFile[] | undefined {
    if (!Array.isArray(files) || files.length < 1) return undefined;

    const normalized = files
        .map((file) => {
            const path = typeof file.path === "string" ? file.path.trim() : "";
            if (!path) return null;

            return {
                path,
                content: String(file.content ?? ""),
                ...(typeof file.readOnly === "boolean"
                    ? { readOnly: file.readOnly }
                    : {}),
            };
        })
        .filter((file): file is ProgrammingCodeFile => Boolean(file));

    return normalized.length > 0 ? normalized : undefined;
}

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
            ...(input.workspaceExpectations
                ? { workspaceExpectations: input.workspaceExpectations }
                : {}),
            solutionCode: input.solutionCode,
        };
    }

    const tests =
        Array.isArray(input.tests) && input.tests.length > 0
            ? input.tests.map((test) => {
                const files = normalizeTestFiles(test.files);

                return {
                    stdin: typeof test.stdin === "string" ? test.stdin : "",
                    stdout: String(test.stdout ?? ""),
                    match: test.match ?? "exact",
                    ...(files ? { files } : {}),
                };
            })
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
        ...(input.workspaceExpectations
            ? { workspaceExpectations: input.workspaceExpectations }
            : {}),
        solutionCode: input.solutionCode,
    };
}