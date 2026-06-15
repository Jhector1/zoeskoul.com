import {
    type HiddenShellCheck,
    type ProgrammingCodeTest,
    type ProgrammingExpected,
    type ProgrammingWorkspaceExpectations,
    type TerminalExpectations,
} from "./types.js";

export type ShellTaskMode =
    | "terminal_workspace"
    | "stdout"
    | "workspace_and_stdout";

export type ShellTaskExpected = ProgrammingExpected & {
    recipeType: "shell_task";
    shellTaskMode?: ShellTaskMode;
    sourceChecks?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getShellTaskMeta(value: unknown): {
    recipeType?: string;
    shellTaskMode?: string;
} {
    if (!isRecord(value)) return {};

    const recipe = isRecord(value.recipe) ? value.recipe : null;

    return {
        recipeType:
            typeof value.recipeType === "string"
                ? value.recipeType
                : typeof recipe?.type === "string"
                  ? recipe.type
                  : undefined,
        shellTaskMode:
            typeof value.shellTaskMode === "string"
                ? value.shellTaskMode
                : typeof recipe?.mode === "string"
                  ? recipe.mode
                  : undefined,
    };
}

export function isShellTaskExpectedLike(value: unknown): boolean {
    return getShellTaskMeta(value).recipeType === "shell_task";
}

export function getShellTaskExpectedMode(value: unknown): ShellTaskMode | undefined {
    const mode = getShellTaskMeta(value).shellTaskMode;

    return mode === "terminal_workspace" ||
        mode === "stdout" ||
        mode === "workspace_and_stdout"
        ? mode
        : undefined;
}

export function hasWorkspaceExpectations(value: unknown): boolean {
    if (!isRecord(value)) return false;

    const expectations = value.workspaceExpectations;
    if (!isRecord(expectations)) return false;

    return (
        Array.isArray(expectations.requiredFiles) ||
        Array.isArray(expectations.requiredFolders) ||
        Array.isArray(expectations.forbiddenFiles)
    );
}

export function hasTerminalExpectations(value: unknown): boolean {
    if (!isRecord(value)) return false;

    const expectations = value.terminalExpectations;
    if (!isRecord(expectations)) return false;

    return (
        Array.isArray(expectations.requiredCommands) ||
        Array.isArray(expectations.forbiddenCommands) ||
        Array.isArray(expectations.outputContains) ||
        Array.isArray(expectations.outputRegex) ||
        typeof expectations.cwdContains === "string" ||
        typeof expectations.cwdEndsWith === "string"
    );
}

export function hasBlankShellTaskTest(value: unknown): boolean {
    if (!isRecord(value)) return false;

    const tests = value.tests;

    if (!Array.isArray(tests)) return true;
    if (tests.length === 0) return true;

    return tests.every((test) => {
        if (!isRecord(test)) return false;

        const stdout = String(test.stdout ?? "");
        const match = String(test.match ?? "includes");

        return stdout === "" && match === "includes";
    });
}

export function isTerminalWorkspaceShellTaskExpectedLike(value: unknown): boolean {
    if (!isRecord(value)) return false;

    const { recipeType, shellTaskMode } = getShellTaskMeta(value);

    if (recipeType === "shell_task" && shellTaskMode === "terminal_workspace") {
        return true;
    }

    // Backward-compatible fallback for already-created instances whose
    // recipeType/shellTaskMode metadata was stripped by old expected normalization.
    return (
        String(value.language ?? "") === "bash" &&
        hasWorkspaceExpectations(value) &&
        hasBlankShellTaskTest(value)
    );
}

export function hasTerminalEvidence(value: unknown): boolean {
    if (!isRecord(value)) return false;

    const terminalEvidence = value.terminalEvidence;
    if (!isRecord(terminalEvidence)) return false;

    return (
        (Array.isArray(terminalEvidence.commands) &&
            terminalEvidence.commands.some(
                (entry) => String(entry ?? "").trim().length > 0,
            )) ||
        String(terminalEvidence.outputText ?? "").trim().length > 0 ||
        String(terminalEvidence.cwd ?? "").trim().length > 0
    );
}

export function makeShellTaskExpected(args: {
    mode?: ShellTaskMode;
    workspaceExpectations?: ProgrammingWorkspaceExpectations | null;
    terminalExpectations?: TerminalExpectations | null;
    hiddenShellCheck?: HiddenShellCheck | null;
    sourceChecks?: unknown[] | null;
    tests?: ProgrammingCodeTest[] | null;
    solutionCode?: string;
    requireTerminalWorkspaceExpectations?: boolean;
} = {}): ShellTaskExpected {
    const mode = args.mode ?? "terminal_workspace";
    const workspaceExpectations = args.workspaceExpectations ?? undefined;
    const terminalExpectations = args.terminalExpectations ?? undefined;
    const hiddenShellCheck = args.hiddenShellCheck ?? undefined;
    const sourceChecks = Array.isArray(args.sourceChecks)
        ? args.sourceChecks.filter(Boolean)
        : [];

    if (
        mode === "terminal_workspace" &&
        args.requireTerminalWorkspaceExpectations !== false &&
        !workspaceExpectations &&
        !terminalExpectations &&
        !hiddenShellCheck
    ) {
        throw new Error(
            "shell_task terminal_workspace expected needs workspaceExpectations, terminalExpectations, or hiddenShellCheck.",
        );
    }

    const tests =
        Array.isArray(args.tests) && args.tests.length > 0
            ? args.tests.map((test) => ({
                  ...(typeof test.stdin === "string" ? { stdin: test.stdin } : {}),
                  stdout: String(test.stdout ?? ""),
                  match: test.match ?? "includes",
                  ...(Array.isArray(test.files) && test.files.length > 0
                      ? { files: test.files }
                      : {}),
              }))
            : [
                  {
                      stdout: "",
                      match: "includes" as const,
                  },
              ];

    return {
        kind: "code_input",
        strategy: "programming",
        language: "bash",
        checkMode: "stdout",
        tests,
        semanticChecks: [],
        recipeType: "shell_task",
        shellTaskMode: mode,
        ...(workspaceExpectations ? { workspaceExpectations } : {}),
        ...(terminalExpectations ? { terminalExpectations } : {}),
        ...(hiddenShellCheck ? { hiddenShellCheck } : {}),
        ...(args.solutionCode ? { solutionCode: args.solutionCode } : {}),
        ...(sourceChecks.length ? { sourceChecks } : {}),
    } as ShellTaskExpected;
}
