import {
    type HiddenShellCheck,
    type TerminalExpectations,
    ManifestCodeInput,
    ManifestStarterFile,
    ManifestWorkspaceExpectations,
    ProgrammingCodeInputStarterFileDraft,
    normalizeWorkspaceExpectations,
    normalizeWorkspacePath,
} from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
} from "../types.js";
import { bashShape } from "../shapes/bashShape.js";
import {
    createCodeInputProjectCapability,
    sharedPracticeProfileConfig,
} from "../shared/generationPolicy.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function safeNormalizeWorkspacePath(path: string, label: string): string {
    try {
        return normalizeWorkspacePath(path);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

function normalizeBashStarterFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    const seen = new Set<string>();
    const normalized: ManifestStarterFile[] = [];

    for (const file of files) {
        const path = safeNormalizeWorkspacePath(file.path, "Invalid Bash starter file path");

        if (seen.has(path)) continue;
        seen.add(path);

        normalized.push({
            path,
            content: String(file.content ?? ""),
            language: "bash",
            ...(typeof file.isEntry === "boolean"
                ? { isEntry: file.isEntry }
                : {}),
            ...(typeof file.entry === "boolean"
                ? { entry: file.entry }
                : {}),
            ...(typeof file.readOnly === "boolean"
                ? { readOnly: file.readOnly }
                : {}),
        });
    }

    return normalized;
}

function normalizeBashWorkspaceExpectations(
    value: unknown,
): ManifestWorkspaceExpectations | undefined {
    if (typeof value === "undefined") return undefined;

    try {
        return normalizeWorkspaceExpectations(value, "workspaceExpectations");
    } catch (error) {
        throw new Error(`Invalid Bash workspaceExpectations: ${(error as Error).message}`);
    }
}


function normalizeTerminalCommandExpectations(
    value: unknown,
    label: string,
): TerminalExpectations["requiredCommands"] | undefined {
    if (typeof value === "undefined") return undefined;

    if (!Array.isArray(value)) {
        throw new Error(`Invalid Bash terminalExpectations: ${label} must be an array.`);
    }

    return value.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new Error(
                `Invalid Bash terminalExpectations: ${label}[${index}] must be an object.`,
            );
        }

        const record = entry as Record<string, unknown>;
        const pattern = normalizeText(record.pattern);

        if (!pattern) {
            throw new Error(
                `Invalid Bash terminalExpectations: ${label}[${index}].pattern must be non-empty.`,
            );
        }

        const message = normalizeText(record.message);

        return {
            pattern,
            ...(message ? { message } : {}),
        };
    });
}

function normalizeTerminalStringList(
    value: unknown,
    label: string,
): string[] | undefined {
    if (typeof value === "undefined") return undefined;

    if (!Array.isArray(value)) {
        throw new Error(`Invalid Bash terminalExpectations: ${label} must be an array.`);
    }

    const items = value.map((entry, index) => {
        const text = normalizeText(entry);
        if (!text) {
            throw new Error(
                `Invalid Bash terminalExpectations: ${label}[${index}] must be a non-empty string.`,
            );
        }
        return text;
    });

    return items.length ? items : undefined;
}

function normalizeBashTerminalExpectations(
    value: unknown,
): TerminalExpectations | undefined {
    if (typeof value === "undefined") return undefined;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid Bash terminalExpectations: expected an object.");
    }

    const record = value as Record<string, unknown>;
    const supportedKeys = new Set([
        "requiredCommands",
        "forbiddenCommands",
        "outputContains",
        "outputRegex",
        "cwdContains",
        "cwdEndsWith",
    ]);

    for (const key of Object.keys(record)) {
        if (!supportedKeys.has(key)) {
            throw new Error(
                `Invalid Bash terminalExpectations: unsupported key "${key}".`,
            );
        }
    }

    const requiredCommands = normalizeTerminalCommandExpectations(
        record.requiredCommands,
        "requiredCommands",
    );
    const forbiddenCommands = normalizeTerminalCommandExpectations(
        record.forbiddenCommands,
        "forbiddenCommands",
    );
    const outputContains = normalizeTerminalStringList(
        record.outputContains,
        "outputContains",
    );
    const outputRegex = normalizeTerminalStringList(record.outputRegex, "outputRegex");
    const cwdContains = normalizeText(record.cwdContains);
    const cwdEndsWith = normalizeText(record.cwdEndsWith);

    const result: TerminalExpectations = {
        ...(requiredCommands?.length ? { requiredCommands } : {}),
        ...(forbiddenCommands?.length ? { forbiddenCommands } : {}),
        ...(outputContains?.length ? { outputContains } : {}),
        ...(outputRegex?.length ? { outputRegex } : {}),
        ...(cwdContains ? { cwdContains } : {}),
        ...(cwdEndsWith ? { cwdEndsWith } : {}),
    };

    return Object.keys(result).length ? result : undefined;
}

function normalizeBashHiddenShellCheck(
    value: unknown,
): HiddenShellCheck | undefined {
    if (typeof value === "undefined") return undefined;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid Bash hiddenShellCheck: expected an object.");
    }

    const record = value as Record<string, unknown>;
    const script = typeof record.script === "string" ? record.script.trim() : "";

    if (!script) {
        throw new Error("Invalid Bash hiddenShellCheck: script must be non-empty.");
    }

    if (
        typeof record.timeoutMs !== "undefined" &&
        (typeof record.timeoutMs !== "number" ||
            !Number.isInteger(record.timeoutMs) ||
            record.timeoutMs < 1)
    ) {
        throw new Error(
            "Invalid Bash hiddenShellCheck: timeoutMs must be a positive integer when provided.",
        );
    }

    return {
        script,
        ...(typeof record.timeoutMs === "number"
            ? { timeoutMs: record.timeoutMs }
            : {}),
    };
}

function makeBashCodeHelpFallback(args: {
    title: string;
    prompt: string;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || "this Linux terminal task";

    return {
        hint: `Read the Linux task "${task}" and identify the folders or files you must create or organize.`,
        help: {
            concept: `This Linux terminal exercise checks the final workspace state for "${task}".`,
            hint_1: "Use the terminal to make one small workspace change at a time, then inspect the result in the file explorer.",
            hint_2: "If a path is required, match the exact folder and file names before clicking Check Answer.",
        },
    };
}

const bashCodeInputCapability: CodeInputProfileCapability = {
    defaultStarter() {
        return 'echo "Hello from Bash!"\n';
    },
    defaultRecipeType() {
        return "shell_task";
    },
    repairDraft(args) {
        return {
            ...args.exercise,
            fixedLanguage: "bash",
            recipeType: "shell_task",
            mode:
                args.exercise.mode === "stdout" ||
                args.exercise.mode === "workspace_and_stdout"
                    ? args.exercise.mode
                    : "terminal_workspace",
        };
    },
    getHelpFallback(args) {
        return makeBashCodeHelpFallback(args);
    },
    showExpectedExample() {
        return false;
    },
    buildManifest(args) {
        const recipeType = args.exercise.recipeType ?? "shell_task";
        if (recipeType !== "shell_task") {
            throw new Error(
                `Bash code_input exercise "${args.exercise.id}" must use recipeType "shell_task".`,
            );
        }

        const starterCode = args.exercise.starterCode || 'echo "Hello from Bash!"\n';
        const authoredEntryFilePath = safeNormalizeWorkspacePath(
            (args.exercise as { entryFilePath?: string }).entryFilePath ?? "main.sh",
            "Invalid Bash entryFilePath",
        );
        const starterFiles = normalizeBashStarterFiles(args.exercise.starterFiles);
        const solutionFiles = normalizeBashStarterFiles(
            (args.exercise as { solutionFiles?: ProgrammingCodeInputStarterFileDraft[] })
                .solutionFiles,
        );
        const hasEntryFile = starterFiles.some(
            (file) => file.path === authoredEntryFilePath,
        );
        const normalizedStarterFiles = hasEntryFile
            ? starterFiles.map((file) =>
                file.path === authoredEntryFilePath
                    ? {
                        ...file,
                        language: "bash",
                        isEntry: true,
                        entry: true,
                    }
                    : {
                        ...file,
                        language: "bash",
                    },
            )
            : [
                {
                    path: authoredEntryFilePath,
                    content: starterCode,
                    language: "bash" as const,
                    isEntry: true,
                    entry: true,
                },
                ...starterFiles,
            ];
        const normalizedSolutionFiles = solutionFiles.length > 0
            ? solutionFiles.map((file) =>
                file.path === authoredEntryFilePath
                    ? {
                        ...file,
                        language: "bash",
                        isEntry: true,
                        entry: true,
                    }
                    : {
                        ...file,
                        language: "bash",
                    },
            )
            : [
                {
                    path: authoredEntryFilePath,
                    content: args.exercise.solutionCode || starterCode,
                    language: "bash" as const,
                    isEntry: true,
                    entry: true,
                },
            ];
        const workspaceExpectations = normalizeBashWorkspaceExpectations(
            args.exercise.workspaceExpectations,
        );
        const terminalExpectations = normalizeBashTerminalExpectations(
            (args.exercise as { terminalExpectations?: unknown }).terminalExpectations,
        );
        const hiddenShellCheck = normalizeBashHiddenShellCheck(
            (args.exercise as { hiddenShellCheck?: unknown }).hiddenShellCheck,
        );
        const mode =
            args.exercise.mode === "stdout" ||
            args.exercise.mode === "workspace_and_stdout" ||
            args.exercise.mode === "terminal_workspace"
                ? args.exercise.mode
                : "terminal_workspace";
        const instructions = normalizeText(args.exercise.instructions || args.exercise.prompt);

        if (terminalExpectations && mode !== "terminal_workspace") {
            throw new Error(
                `Bash code_input exercise "${args.exercise.id}" may only use terminalExpectations with mode "terminal_workspace".`,
            );
        }

        if (hiddenShellCheck && mode !== "terminal_workspace") {
            throw new Error(
                `Bash code_input exercise "${args.exercise.id}" may only use hiddenShellCheck with mode "terminal_workspace".`,
            );
        }

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "bash",
            starterCode,
            starterFiles: normalizedStarterFiles,
            solutionFiles: normalizedSolutionFiles,
            ...(workspaceExpectations ? { workspaceExpectations } : {}),
            ...(terminalExpectations ? { terminalExpectations } : {}),
            ...(hiddenShellCheck ? { hiddenShellCheck } : {}),
            workspace: {
                language: "bash",
                entryFilePath: authoredEntryFilePath,
                starterCode,
                starterFiles: normalizedStarterFiles,
                ...(workspaceExpectations ? { workspaceExpectations } : {}),
            },
            showExpectedExample: false,
            recipe: {
                type: "shell_task",
                mode,
                ...(instructions ? { instructions } : {}),
            },
        } satisfies ManifestCodeInput;
    },
};

export const bashProfile: CourseProfile = {
    id: "bash",
    shape: bashShape,
    runtimeKind: "code",
    defaultLanguage: "bash",
    defaultEntryFileName: "main.sh",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["shell_task"],
    buildModuleRuntimeDefaults() {
        return {
            kind: "code",
            language: "bash",
            supportsTerminal: true,
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsStdInStdOut: true,
            supportsPackageInstall: false,
            fileActions: {
                enabled: true,
                createFile: true,
                createFolder: true,
                rename: true,
                delete: true,
                dragDrop: false,
            },
        };
    },
    practice: sharedPracticeProfileConfig,
    project: createCodeInputProjectCapability(),
    renderExerciseKindPromptRules() {
        return [
            '- For Bash/Linux code_input, use recipeType "shell_task".',
            '- For Course 1 Linux labs, use mode "terminal_workspace".',
            "- Grade Bash/Linux terminal tasks from workspaceExpectations instead of stdout or Judge0.",
            '- Keep exercise language exactly "bash". Do not use "linux" as a language value.',
            '- Keep learner-facing titles about Linux or Linux Terminal, not Bash as the course name.',
        ];
    },
    renderAuthoringPromptRules(args) {
        const counts = (args.seed?.plannedExerciseCounts?.counts ?? {}) as Record<
            string,
            number | undefined
        >;
        const requiredCodeInputs = Number(counts.code_input ?? 0);

        return [
            'Use profileId "bash" for Linux terminal coursework so the app assigns terminal-first tooling.',
            "Keep Course 1 terminal tasks focused on workspace changes the checker can validate safely.",
            "quizDraft must include the Bash/Linux code_input exercises required by the exercise policy; do not put them only in projectDraft.",
            requiredCodeInputs > 0
                ? `This topic requires exactly ${requiredCodeInputs} Bash/Linux code_input item(s) inside quizDraft.`
                : "If the exercise policy requires code_input, put those code_input items inside quizDraft.",
            'Every Bash/Linux code_input must use fixedLanguage "bash", recipeType "shell_task", and mode "terminal_workspace".',
            'Every Bash/Linux code_input should include entryFilePath "main.sh" and starterCode or starterFiles with a main.sh entry file.',
            'Use workspaceExpectations for file-tree outcomes: requiredFolders, requiredFiles, forbiddenFiles, and entryFilePath.',
            'Use terminalExpectations only for command/output outcomes: requiredCommands, forbiddenCommands, outputContains, outputRegex, cwdContains, and cwdEndsWith.',
            'Do not use checker.defaultRecipe "workspace_expectations"; Linux terminal tasks compile through recipeType "shell_task" and pass expectations into the shell_task expected payload.',
            'Use per-exercise terminal workspaces for independent quiz/check questions; only use project/capstone scope when one activity intentionally shares a workspace across all steps.',
            "Do not replace missing Bash/Linux code_input exercises with extra fill_blank_choice items.",
            "Do not ask learners to write Bash scripts in Course 1; ask them to run terminal commands that shape or inspect the workspace.",
        ];
    },
    codeInput: bashCodeInputCapability,
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle(bundle) {
        const issues: string[] = [];
        const courseSlug = (bundle as { courseSlug?: string }).courseSlug;
        const isLinuxTerminalFundamentals =
            bundle.subjectSlug === "linux-terminal-fundamentals" ||
            courseSlug === "linux-terminal-fundamentals" ||
            bundle.subjectSlug?.includes("linux-terminal-fundamentals");

        for (const exercise of bundle.exercises ?? []) {
            if (exercise.kind !== "code_input") continue;

            if (exercise.language !== "bash") {
                issues.push(
                    `Bash/Linux code_input "${exercise.id}" must declare language "bash".`,
                );
            }

            if (exercise.recipe?.type !== "shell_task") {
                issues.push(
                    `Bash/Linux code_input "${exercise.id}" must use recipe.type "shell_task".`,
                );
                continue;
            }

            if (isLinuxTerminalFundamentals && exercise.recipe.mode !== "terminal_workspace") {
                issues.push(
                    `Linux Terminal Fundamentals code_input "${exercise.id}" must use shell_task mode "terminal_workspace".`,
                );
            }

            const workspaceExpectations =
                exercise.workspaceExpectations ?? exercise.workspace?.workspaceExpectations;
            const terminalExpectations = exercise.terminalExpectations;
            const hasWorkspaceExpectations = Boolean(workspaceExpectations);
            const hasTerminalExpectations = Boolean(terminalExpectations);
            const hasHiddenShellCheck = Boolean(exercise.hiddenShellCheck);
            const hasSourceChecks =
                Array.isArray(exercise.sourceChecks) && exercise.sourceChecks.length > 0;

            if (
                exercise.recipe.mode === "terminal_workspace" &&
                !hasWorkspaceExpectations &&
                !hasTerminalExpectations &&
                !hasHiddenShellCheck &&
                !hasSourceChecks
            ) {
                issues.push(
                    `Bash/Linux terminal_workspace code_input "${exercise.id}" must include workspaceExpectations, terminalExpectations, hiddenShellCheck, or sourceChecks.`,
                );
            }

            if (
                terminalExpectations &&
                exercise.recipe.mode !== "terminal_workspace"
            ) {
                issues.push(
                    `Bash/Linux code_input "${exercise.id}" may only use terminalExpectations with mode "terminal_workspace".`,
                );
            }

            if (
                workspaceExpectations &&
                "forbiddenFolders" in (workspaceExpectations as Record<string, unknown>)
            ) {
                issues.push(
                    `Bash/Linux code_input "${exercise.id}" uses unsupported workspaceExpectations.forbiddenFolders; use forbiddenFiles or a hiddenShellCheck instead.`,
                );
            }
        }

        return issues;
    },
};
