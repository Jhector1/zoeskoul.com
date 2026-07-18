import {
    type HiddenShellCheck,
    type ManifestCodeInput,
    type ManifestStarterFile,
    type ManifestWorkspaceExpectations,
    type ProgrammingCodeInputStarterFileDraft,
    type TerminalExpectations,
    normalizeHiddenShellCheck,
    normalizeTerminalExpectations,
    normalizeWorkspaceExpectations,
    normalizeWorkspacePath,
} from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
    ProfileCodeInputDraft,
} from "../types.js";
import type { SubjectShapePack } from "../shapes/types.js";
import {
    messageTag,
    starterFileContentMessageTag,
} from "../shared/messageTags.js";

export type TerminalCourseProfileConfig = {
    id: string;
    shape: SubjectShapePack;
    errorLabel: string;
    validationLabel: string;
    defaultStarterCode: string;
    forceTerminalWorkspace?: boolean;
    buildModuleServiceDefaults?: NonNullable<
        CourseProfile["buildModuleServiceDefaults"]
    >;
    makeHelpFallback(args: {
        title: string;
        prompt: string;
    }): CodeInputHelpFallback;
    renderExerciseKindPromptRules(args: Parameters<
        NonNullable<CourseProfile["renderExerciseKindPromptRules"]>
    >[0]): string[];
    renderAuthoringPromptRules(args: Parameters<
        NonNullable<CourseProfile["renderAuthoringPromptRules"]>
    >[0]): string[];
    requireTerminalWorkspace(args: {
        bundle: Parameters<CourseProfile["validateTopicBundle"]>[0];
        exercise: ManifestCodeInput;
    }): boolean;
    terminalWorkspaceValidationLabel?(args: {
        bundle: Parameters<CourseProfile["validateTopicBundle"]>[0];
        exercise: ManifestCodeInput;
    }): string;
    buildAdditionalHiddenShellCheck?(args: {
        exercise: ProfileCodeInputDraft;
        messageBase: string;
    }): HiddenShellCheck | undefined;
    validateCompiledExercise?(args: {
        bundle: Parameters<CourseProfile["validateTopicBundle"]>[0];
        exercise: ManifestCodeInput;
    }): string[];
};

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function safeNormalizeWorkspacePath(
    path: string,
    label: string,
): string {
    try {
        return normalizeWorkspacePath(path);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

type NormalizedTerminalStarterFile = ManifestStarterFile & {
    path: string;
    content: string;
    language: "bash";
};

function normalizeStarterFiles(args: {
    files: ProgrammingCodeInputStarterFileDraft[] | undefined;
    errorLabel: string;
}): NormalizedTerminalStarterFile[] {
    if (!Array.isArray(args.files)) return [];

    const seen = new Set<string>();
    const normalized: NormalizedTerminalStarterFile[] = [];

    for (const file of args.files) {
        const path = safeNormalizeWorkspacePath(
            file.path,
            `Invalid ${args.errorLabel} starter file path`,
        );

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

function normalizeTerminalWorkspaceExpectations(args: {
    value: unknown;
    errorLabel: string;
}): ManifestWorkspaceExpectations | undefined {
    if (typeof args.value === "undefined") return undefined;

    try {
        return normalizeWorkspaceExpectations(
            args.value,
            "workspaceExpectations",
        );
    } catch (error) {
        throw new Error(
            `Invalid ${args.errorLabel} workspaceExpectations: ${(error as Error).message}`,
        );
    }
}

function withTerminalExpectationMessageRefs(args: {
    terminalExpectations?: TerminalExpectations;
    messageBase: string;
}): TerminalExpectations | undefined {
    if (!args.terminalExpectations) return undefined;

    const withCommandRefs = (
        entries: TerminalExpectations["requiredCommands"],
        kind: "requiredCommands" | "forbiddenCommands",
    ) => {
        if (!entries?.length) return entries;

        return entries.map((entry, index) => ({
            ...entry,
            ...(entry.message
                ? {
                    message: messageTag(
                        args.messageBase,
                        `terminalExpectations.${kind}.${index}.message`,
                    ),
                }
                : {}),
        }));
    };

    const requiredCommands = withCommandRefs(
        args.terminalExpectations.requiredCommands,
        "requiredCommands",
    );
    const forbiddenCommands = withCommandRefs(
        args.terminalExpectations.forbiddenCommands,
        "forbiddenCommands",
    );

    return {
        ...args.terminalExpectations,
        ...(requiredCommands?.length ? { requiredCommands } : {}),
        ...(forbiddenCommands?.length ? { forbiddenCommands } : {}),
    };
}

function combineHiddenShellChecks(
    authored: HiddenShellCheck | undefined,
    generated: HiddenShellCheck | undefined,
): HiddenShellCheck | undefined {
    if (!authored) return generated;
    if (!generated) return authored;

    return {
        script: [
            "set -eu",
            "(",
            authored.script,
            ")",
            "(",
            generated.script,
            ")",
        ].join("\n"),
        timeoutMs: Math.max(
            authored.timeoutMs ?? 10_000,
            generated.timeoutMs ?? 10_000,
        ),
    };
}

function buildTerminalCodeInputCapability(
    config: TerminalCourseProfileConfig,
): CodeInputProfileCapability {
    return {
        defaultStarter() {
            return config.defaultStarterCode;
        },
        defaultRecipeType() {
            return "shell_task";
        },
        repairDraft(args) {
            return {
                ...args.exercise,
                fixedLanguage: "bash",
                recipeType: "shell_task",
                mode: config.forceTerminalWorkspace
                    ? "terminal_workspace"
                    : args.exercise.mode === "stdout" ||
                        args.exercise.mode === "workspace_and_stdout"
                      ? args.exercise.mode
                      : "terminal_workspace",
            };
        },
        getHelpFallback(args) {
            return config.makeHelpFallback(args);
        },
        showExpectedExample() {
            return false;
        },
        buildManifest(args) {
            const recipeType = args.exercise.recipeType ?? "shell_task";
            if (recipeType !== "shell_task") {
                throw new Error(
                    `${config.errorLabel} code_input exercise "${args.exercise.id}" must use recipeType "shell_task".`,
                );
            }

            const starterCode =
                args.exercise.starterCode || config.defaultStarterCode;
            const starterCodeTag = messageTag(args.messageBase, "starterCode");
            const authoredEntryFilePath = safeNormalizeWorkspacePath(
                args.exercise.entryFilePath ?? "main.sh",
                `Invalid ${config.errorLabel} entryFilePath`,
            );
            const starterFiles = normalizeStarterFiles({
                files: args.exercise.starterFiles,
                errorLabel: config.errorLabel,
            });
            const solutionFiles = normalizeStarterFiles({
                files: args.exercise.solutionFiles,
                errorLabel: config.errorLabel,
            });
            const hasEntryFile = starterFiles.some(
                (file) => file.path === authoredEntryFilePath,
            );
            const normalizedStarterFiles = (hasEntryFile
                ? starterFiles
                : [
                    {
                        path: authoredEntryFilePath,
                        content: starterCode,
                        language: "bash" as const,
                        isEntry: true,
                        entry: true,
                    },
                    ...starterFiles,
                ]).map((file, index) =>
                    file.path === authoredEntryFilePath
                        ? {
                            ...file,
                            content: starterCodeTag,
                            language: "bash" as const,
                            isEntry: true,
                            entry: true,
                        }
                        : {
                            ...file,
                            content: starterFileContentMessageTag({
                                messageBase: args.messageBase,
                                filePath: file.path,
                                index,
                            }),
                            language: "bash" as const,
                        },
                );
            const normalizedSolutionFiles =
                solutionFiles.length > 0
                    ? solutionFiles.map((file) =>
                        file.path === authoredEntryFilePath
                            ? {
                                ...file,
                                language: "bash" as const,
                                isEntry: true,
                                entry: true,
                            }
                            : {
                                ...file,
                                language: "bash" as const,
                            },
                    )
                    : [
                        {
                            path: authoredEntryFilePath,
                            content:
                                args.exercise.solutionCode || starterCode,
                            language: "bash" as const,
                            isEntry: true,
                            entry: true,
                        },
                    ];
            const workspaceExpectations =
                normalizeTerminalWorkspaceExpectations({
                    value: args.exercise.workspaceExpectations,
                    errorLabel: config.errorLabel,
                });
            const terminalExpectations = normalizeTerminalExpectations(
                args.exercise.terminalExpectations,
                `Invalid ${config.errorLabel} terminalExpectations`,
            );
            const terminalExpectationsWithMessageRefs =
                withTerminalExpectationMessageRefs({
                    terminalExpectations,
                    messageBase: args.messageBase,
                });
            const authoredHiddenShellCheck = normalizeHiddenShellCheck(
                args.exercise.hiddenShellCheck,
                `Invalid ${config.errorLabel} hiddenShellCheck`,
            );
            const generatedHiddenShellCheck =
                config.buildAdditionalHiddenShellCheck?.({
                    exercise: args.exercise,
                    messageBase: args.messageBase,
                });
            const hiddenShellCheck = combineHiddenShellChecks(
                authoredHiddenShellCheck,
                generatedHiddenShellCheck,
            );
            const mode =
                args.exercise.mode === "stdout" ||
                args.exercise.mode === "workspace_and_stdout" ||
                args.exercise.mode === "terminal_workspace"
                    ? args.exercise.mode
                    : "terminal_workspace";
            const explicitInstructions = normalizeText(
                args.exercise.instructions,
            );
            const instructions = explicitInstructions
                ? messageTag(args.messageBase, "instructions")
                : messageTag(args.messageBase, "prompt");

            if (terminalExpectations && mode !== "terminal_workspace") {
                throw new Error(
                    `${config.errorLabel} code_input exercise "${args.exercise.id}" may only use terminalExpectations with mode "terminal_workspace".`,
                );
            }

            if (hiddenShellCheck && mode !== "terminal_workspace") {
                throw new Error(
                    `${config.errorLabel} code_input exercise "${args.exercise.id}" may only use hiddenShellCheck with mode "terminal_workspace".`,
                );
            }

            return {
                id: args.exercise.id,
                kind: "code_input",
                purpose: "project",
                weight: 1,
                messageBase: args.messageBase,
                language: "bash",
                starterCode: starterCodeTag,
                starterFiles: normalizedStarterFiles,
                solutionFiles: normalizedSolutionFiles,
                ...(workspaceExpectations ? { workspaceExpectations } : {}),
                ...(terminalExpectationsWithMessageRefs
                    ? {
                        terminalExpectations:
                            terminalExpectationsWithMessageRefs,
                    }
                    : {}),
                ...(hiddenShellCheck ? { hiddenShellCheck } : {}),
                workspace: {
                    language: "bash",
                    entryFilePath: authoredEntryFilePath,
                    starterCode: starterCodeTag,
                    starterFiles: normalizedStarterFiles,
                    ...(workspaceExpectations
                        ? { workspaceExpectations }
                        : {}),
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
}

export function createTerminalCourseProfile(
    config: TerminalCourseProfileConfig,
): CourseProfile {
    return {
        id: config.id,
        shape: config.shape,
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
        buildModuleServiceDefaults(moduleOrder, module) {
            return config.buildModuleServiceDefaults?.(moduleOrder, module) ?? null;
        },
        renderExerciseKindPromptRules(args) {
            return config.renderExerciseKindPromptRules(args);
        },
        renderAuthoringPromptRules(args) {
            return config.renderAuthoringPromptRules(args);
        },
        codeInput: buildTerminalCodeInputCapability(config),
        getRecipeRegistry() {
            return {};
        },
        validateTopicBundle(bundle) {
            const issues: string[] = [];

            for (const exercise of bundle.exercises ?? []) {
                if (exercise.kind !== "code_input") continue;

                if (exercise.language !== "bash") {
                    issues.push(
                        `${config.validationLabel} code_input "${exercise.id}" must declare language "bash".`,
                    );
                }

                if (exercise.recipe?.type !== "shell_task") {
                    issues.push(
                        `${config.validationLabel} code_input "${exercise.id}" must use recipe.type "shell_task".`,
                    );
                    continue;
                }

                if (
                    config.requireTerminalWorkspace({ bundle, exercise }) &&
                    exercise.recipe.mode !== "terminal_workspace"
                ) {
                    const terminalWorkspaceLabel =
                        config.terminalWorkspaceValidationLabel?.({
                            bundle,
                            exercise,
                        }) ?? config.validationLabel;
                    issues.push(
                        `${terminalWorkspaceLabel} code_input "${exercise.id}" must use shell_task mode "terminal_workspace".`,
                    );
                }

                const workspaceExpectations =
                    exercise.workspaceExpectations ??
                    exercise.workspace?.workspaceExpectations;
                const terminalExpectations = exercise.terminalExpectations;
                const hasWorkspaceExpectations = Boolean(
                    workspaceExpectations,
                );
                const hasTerminalExpectations = Boolean(
                    terminalExpectations,
                );
                const hasHiddenShellCheck = Boolean(
                    exercise.hiddenShellCheck,
                );
                const hasSourceChecks =
                    Array.isArray(exercise.sourceChecks) &&
                    exercise.sourceChecks.length > 0;

                if (
                    exercise.recipe.mode === "terminal_workspace" &&
                    !hasWorkspaceExpectations &&
                    !hasTerminalExpectations &&
                    !hasHiddenShellCheck &&
                    !hasSourceChecks
                ) {
                    issues.push(
                        `${config.validationLabel} terminal_workspace code_input "${exercise.id}" must include workspaceExpectations, terminalExpectations, hiddenShellCheck, or sourceChecks.`,
                    );
                }

                if (
                    terminalExpectations &&
                    exercise.recipe.mode !== "terminal_workspace"
                ) {
                    issues.push(
                        `${config.validationLabel} code_input "${exercise.id}" may only use terminalExpectations with mode "terminal_workspace".`,
                    );
                }

                if (
                    workspaceExpectations &&
                    "forbiddenFolders" in
                        (workspaceExpectations as Record<string, unknown>)
                ) {
                    issues.push(
                        `${config.validationLabel} code_input "${exercise.id}" uses unsupported workspaceExpectations.forbiddenFolders; use forbiddenFiles or a hiddenShellCheck instead.`,
                    );
                }

                issues.push(
                    ...(config.validateCompiledExercise?.({
                        bundle,
                        exercise,
                    }) ?? []),
                );
            }

            return issues;
        },
    };
}
