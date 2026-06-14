import {
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
import { pythonProfile } from "../python/profile.js";

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
        const workspaceExpectations = normalizeBashWorkspaceExpectations(
            args.exercise.workspaceExpectations,
        );
        const mode =
            args.exercise.mode === "stdout" ||
            args.exercise.mode === "workspace_and_stdout" ||
            args.exercise.mode === "terminal_workspace"
                ? args.exercise.mode
                : "terminal_workspace";
        const instructions = normalizeText(args.exercise.instructions || args.exercise.prompt);

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "bash",
            starterCode,
            starterFiles: normalizedStarterFiles,
            ...(workspaceExpectations ? { workspaceExpectations } : {}),
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
        };
    },
    practice: pythonProfile.practice,
    project: pythonProfile.project,
    renderExerciseKindPromptRules() {
        return [
            '- For Bash/Linux code_input, use recipeType "shell_task".',
            '- For Course 1 Linux labs, use mode "terminal_workspace".',
            "- Grade Bash/Linux terminal tasks from workspaceExpectations instead of stdout or Judge0.",
            '- Keep exercise language exactly "bash". Do not use "linux" as a language value.',
            '- Keep learner-facing titles about Linux or Linux Terminal, not Bash as the course name.',
        ];
    },
    renderAuthoringPromptRules() {
        return [
            'Use profileId "bash" for Linux terminal coursework so the app assigns terminal-first tooling.',
            "Keep Course 1 terminal tasks focused on workspace changes the checker can validate safely.",
        ];
    },
    codeInput: bashCodeInputCapability,
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};
