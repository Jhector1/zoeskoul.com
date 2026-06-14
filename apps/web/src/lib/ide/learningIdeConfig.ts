import type { TerminalSessionScope } from "@/components/code/runner/runtime";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type {
    FullIDEServicePreset,
    FullIDEServicesInput,
} from "@/components/ide/fullide/services";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

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

export type LearningIdeConfig = {
    preset?: LearningIdeServicePreset;
    runnerBackend?: LearningIdeRunnerBackend;
    requires?: LearningIdeServiceRequirements;
    layoutMode?: LearningIdeLayoutMode;
    terminalSessionScope?: TerminalSessionScope;
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

    if (!supportsFiles && !supportsTerminal) {
        return null;
    }

    return {
        requires: {
            files: supportsFiles,
            multiFile: runtimeDefaults.supportsMultiFile === true,
            terminal: supportsTerminal,
        },
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

        merged = {
            ...(merged ?? {}),
            ...(config.preset ? { preset: config.preset } : {}),
            ...(config.runnerBackend ? { runnerBackend: config.runnerBackend } : {}),
            ...(config.sqlPane ? { sqlPane: { ...previousSqlPane, ...config.sqlPane } } : {}),
            ...(config.layoutMode ? { layoutMode: config.layoutMode } : {}),
            ...(config.terminalSessionScope
                ? { terminalSessionScope: config.terminalSessionScope }
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
    const terminalSessionScope =
        ideConfig?.terminalSessionScope ??
        (terminalWorkspaceMode ? "topic" : "exercise");

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
                    enabled: true,
                    allowMobileDrawer: false,
                    allowResize: true,
                    showFilter: false,
                    showActions: true,
                    showHistoryControls: false,
                    showFooter: false,
                    showStdin: false,
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
                    // Terminal-workspace labs are graded from the synced
                    // workspace snapshot, so learners should not see a normal
                    // Run button for this layout.
                    enableWorkspaceTerminal: true,
                    showTerminalDockToggle: false,
                    allowRun: false,
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
