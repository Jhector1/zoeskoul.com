import type { TerminalSessionScope } from "@/components/code/runner/runtime";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type {
    FullIDEServicePreset,
    FullIDEServicesInput,
} from "@/components/ide/fullide/services";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import type {
    IdeFileActionsConfig,
    ResolvedIdeFileActions,
} from "@/lib/ide/workspacePolicy";
import { resolveIdeFileActions } from "@/lib/ide/workspacePolicy";

export type LearningIdeServicePreset = FullIDEServicePreset;

export type LearningIdeRunnerBackend = "auto" | "judge0" | "pty";
export type LearningIdeLayoutMode =
    | "default"
    | "terminal_workspace";
export type LearningIdeServiceRequirements = {
    files?: boolean;
    terminal?: boolean;
    multiFile?: boolean;
    projectPersistence?: boolean;
    cloudProjects?: boolean;
};

export type LearningIdeFileActions = IdeFileActionsConfig;

export type LearningIdeConfig = {
    preset?: LearningIdeServicePreset;
    runnerBackend?: LearningIdeRunnerBackend;
    requires?: LearningIdeServiceRequirements;
    layoutMode?: LearningIdeLayoutMode;
    terminalSessionScope?: TerminalSessionScope;
    fileActions?: LearningIdeFileActions;
    sqlPane?: SqlPaneOptions;
};
export function learningIdeFromRuntimeDefaults(
    runtimeDefaults?: ManifestRuntimeDefaults | null,
): LearningIdeConfig | null {
    if (!runtimeDefaults) return null;

    const supportsFiles =
        runtimeDefaults.supportsFileSystem === true ||
        runtimeDefaults.supportsMultiFile === true;
    const supportsTerminal = runtimeDefaults.supportsTerminal === true;
    const hasFileActions = runtimeDefaults.fileActions != null;

    if (!supportsFiles && !supportsTerminal && !hasFileActions) {
        return null;
    }

    return {
        ...(supportsFiles || supportsTerminal
            ? {
                requires: {
                    files: supportsFiles,
                    multiFile: runtimeDefaults.supportsMultiFile === true,
                    terminal: supportsTerminal,
                },
            }
            : {}),
        ...(runtimeDefaults.fileActions
            ? { fileActions: runtimeDefaults.fileActions }
            : {}),
    };
}

export function mergeLearningIdeConfigs(
    ...configs: Array<LearningIdeConfig | null | undefined>
): LearningIdeConfig | null {
    let merged: LearningIdeConfig | null = null;

    for (const config of configs) {
        if (!config) continue;
        const previousRequires: LearningIdeServiceRequirements = merged?.requires ?? {};
        const previousSqlPane: SqlPaneOptions = merged?.sqlPane ?? {};
        const previousFileActions: LearningIdeFileActions = merged?.fileActions ?? {};

        merged = {
            ...(merged ?? {}),
            ...(config.preset ? { preset: config.preset } : {}),
            ...(config.runnerBackend ? { runnerBackend: config.runnerBackend } : {}),
            ...(config.sqlPane ? { sqlPane: { ...previousSqlPane, ...config.sqlPane } } : {}),
            ...(config.layoutMode ? { layoutMode: config.layoutMode } : {}),
            ...(config.terminalSessionScope
                ? { terminalSessionScope: config.terminalSessionScope }
                : {}),
            ...(config.fileActions
                ? { fileActions: { ...previousFileActions, ...config.fileActions } }
                : {}),
            requires: {
                ...previousRequires,
                ...(config.requires ?? {}),
            },
        };
    }

    if (!merged) return null;

    if (!Object.keys(merged.requires ?? {}).length) {
        delete merged.requires;
    }

    return merged;
}

export function resolveFullIDEConfigFromLearningIde(args?: {
    ideConfig?: LearningIdeConfig | null;
}): {
    servicePreset: FullIDEServicePreset;
    services: FullIDEServicesInput;
    sqlPaneOptions?: SqlPaneOptions;
    access: {
        canUseMultiFile: boolean;
        canSaveCloud: boolean;
        canCreateProjects: boolean;
    };
} {
    const ideConfig = args?.ideConfig ?? null;
    const requires = ideConfig?.requires ?? {};
    const layoutMode = ideConfig?.layoutMode ?? "default";
    // Course 1 terminal labs intentionally hide the Monaco editor only when
    // layoutMode explicitly opts into terminal_workspace.
    const terminalWorkspaceMode = layoutMode === "terminal_workspace";
    const wantsFiles = requires.files === true;
    const wantsMultiFile = requires.multiFile === true || wantsFiles;
    const wantsTerminal = requires.terminal === true;
    const wantsProjectPersistence = requires.projectPersistence === true;
    const wantsCloudProjects = requires.cloudProjects === true;
    const runnerBackend = ideConfig?.runnerBackend ?? "auto";
    const enableWorkspaceTerminal =
        runnerBackend === "pty" || (runnerBackend === "auto" && wantsTerminal);
    const terminalSessionScope = ideConfig?.terminalSessionScope ?? "exercise";
    const requestedFileActions = resolveIdeFileActions(ideConfig?.fileActions ?? null);
    const fileActions: ResolvedIdeFileActions = terminalWorkspaceMode
        ? {
            enabled: false,
            createFile: false,
            createFolder: false,
            rename: false,
            delete: false,
            dragDrop: false,
        }
        : requestedFileActions;

    const services: FullIDEServicesInput = {
        chrome: {
            showHeader: false,
            showBackButton: false,
            showLessonLink: false,
            showActivePath: false,
            showStatus: false,
            showTopLanguageButtons: false,
        },
        runner: {
            terminalSessionScope,
        },
        ...(wantsFiles || terminalWorkspaceMode
            ? {
                explorer: {
                    // Terminal-workspace lessons intentionally hide the visual file
                    // tree so Linux learners practice `ls`, `cd`, `cat`, `touch`,
                    // `mkdir`, `rm`, `mv`, and `cp` in the shell instead of using
                    // Explorer buttons.
                    enabled: !terminalWorkspaceMode,
                    allowMobileDrawer: !terminalWorkspaceMode,
                    allowResize: !terminalWorkspaceMode,
                    showFilter: false,
                    showActions: !terminalWorkspaceMode,
                    showHistoryControls: false,
                    showFooter: false,
                    showStdin: false,
                    fileActions,
                },
                editor: {
                    showTabs: !terminalWorkspaceMode,
                    showEditor: !terminalWorkspaceMode,
                },
            }
            : {}),
        ...(wantsTerminal || enableWorkspaceTerminal || terminalWorkspaceMode
            ? {
                runner: {
                    showTerminal: true,
                    enableWorkspaceTerminal: true,
                    // Only terminal_workspace labs are graded directly from the
                    // synced shell workspace, so only that layout hides the normal
                    // Run button. Editor + terminal exercises still need Run for
                    // PTY-backed code execution and workspace sync tests.
                    showTerminalDockToggle: !terminalWorkspaceMode,
                    allowRun: !terminalWorkspaceMode,
                    terminalSessionScope,
                },
            }
            : {}),
        ...(wantsProjectPersistence || wantsCloudProjects
            ? {
                projects: {
                    showProjectSwitcher: true,
                    showSaveControls: wantsProjectPersistence,
                    showSaveAs: wantsProjectPersistence,
                    showCloudProjects: wantsCloudProjects,
                },
            }
            : {}),
    };

    return {
        servicePreset: ideConfig?.preset ?? "runner",
        services,
        sqlPaneOptions: ideConfig?.sqlPane,
        access: {
            canUseMultiFile: wantsMultiFile,
            canSaveCloud: wantsProjectPersistence,
            canCreateProjects: wantsProjectPersistence || wantsCloudProjects,
        },
    };
}
