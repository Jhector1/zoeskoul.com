import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type {
    FullIDEServicePreset,
    FullIDEServicesInput,
} from "@/components/ide/fullide/services";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

export type LearningIdeServicePreset = FullIDEServicePreset;

export type LearningIdeRunnerBackend = "auto" | "judge0" | "pty";

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

        const previousRequires: LearningIdeServiceRequirements =
            merged?.requires ?? {};
        const previousSqlPane: SqlPaneOptions = merged?.sqlPane ?? {};

        merged = {
            ...(merged ?? {}),
            ...(config.preset ? { preset: config.preset } : {}),
            ...(config.runnerBackend
                ? { runnerBackend: config.runnerBackend }
                : {}),
            ...(config.sqlPane
                ? { sqlPane: { ...previousSqlPane, ...config.sqlPane } }
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

    const wantsFiles = requires.files === true;
    const wantsMultiFile = requires.multiFile === true || wantsFiles;
    const wantsTerminal = requires.terminal === true;
    const wantsProjectPersistence = requires.projectPersistence === true;
    const wantsCloudProjects = requires.cloudProjects === true;
    const runnerBackend = ideConfig?.runnerBackend ?? "auto";

    /**
     * Important:
     * File-system lessons need the PTY/workspace runner even when the lesson
     * does not expose a terminal tab. Judge0 cannot return created/deleted
     * workspace files to the Explorer in the current app.
     */
    const enableWorkspaceTerminal =
        runnerBackend === "pty" ||
        (runnerBackend === "auto" && (wantsTerminal || wantsFiles));

    const services: FullIDEServicesInput = {
        chrome: {
            showHeader: false,
            showBackButton: false,
            showLessonLink: false,
            showActivePath: false,
            showStatus: false,
            showTopLanguageButtons: false,
        },
        ...(wantsFiles
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
                    showTabs: true,
                },
            }
            : {}),
        ...(wantsTerminal || enableWorkspaceTerminal
            ? {
                runner: {
                    showTerminal: true,
                    enableWorkspaceTerminal,
                    showTerminalDockToggle: enableWorkspaceTerminal,
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