import type { TerminalSessionScope } from "@/components/code/runner/runtime";
import {DEFAULT_IDE_FILE_ACTIONS, ResolvedIdeFileActions} from "@/lib/ide/workspacePolicy";

export type FullIDEExplorerServices = {
    enabled: boolean;
    allowMobileDrawer: boolean;
    allowResize: boolean;
    showFilter: boolean;
    showActions: boolean;
    showHistoryControls: boolean;
    showFooter: boolean;
    showStdin: boolean;
    fileActions: ResolvedIdeFileActions;
};
export type FullIDEEditorServices = {
    showTabs: boolean;
    showEditor: boolean;
};

export type FullIDERunnerServices = {
    allowRun: boolean;
    showTerminal: boolean;
    showTerminalDockToggle: boolean;
    showOpenTerminalButton: boolean;
    showRestartTerminalButton: boolean;
    showThemeToggle: boolean;
    showSqlDialectPicker: boolean;
    enableWorkspaceTerminal: boolean;
    terminalSessionScope: TerminalSessionScope;
    terminalCwd?: string;
};

export type FullIDEProjectServices = {
    showProjectSwitcher: boolean;
    showCloudProjects: boolean;
    showSaveControls: boolean;
    showSaveAs: boolean;
};

export type FullIDEChromeServices = {
    showHeader: boolean;
    showBackButton: boolean;
    showLessonLink: boolean;
    showActivePath: boolean;
    showStatus: boolean;
    showTopLanguageButtons: boolean;
};

export type FullIDEServices = {
    chrome: FullIDEChromeServices;
    explorer: FullIDEExplorerServices;
    editor: FullIDEEditorServices;
    runner: FullIDERunnerServices;
    projects: FullIDEProjectServices;
};

export type FullIDEServicePreset = "workspace" | "lesson" | "runner";

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type FullIDEServicesInput = DeepPartial<FullIDEServices>;




const DISABLED_IDE_FILE_ACTIONS: ResolvedIdeFileActions = {
    enabled: false,
    createFile: false,
    createFolder: false,
    rename: false,
    delete: false,
    dragDrop: false,
};

function resolveFileActions(
    base?: Partial<ResolvedIdeFileActions> | null,
    override?: Partial<ResolvedIdeFileActions> | null,
): ResolvedIdeFileActions {
    const merged = {
        ...DEFAULT_IDE_FILE_ACTIONS,
        ...(base ?? {}),
        ...(override ?? {}),
    };

    if (merged.enabled === false) {
        return { ...DISABLED_IDE_FILE_ACTIONS };
    }

    return {
        enabled: true,
        createFile: merged.createFile !== false,
        createFolder: merged.createFolder !== false,
        rename: merged.rename !== false,
        delete: merged.delete !== false,
        dragDrop: merged.dragDrop !== false,
    };
}


const WORKSPACE_PRESET: FullIDEServices = {
    chrome: {
        showHeader: true,
        showBackButton: true,
        showLessonLink: true,
        showActivePath: true,
        showStatus: true,
        showTopLanguageButtons: true,
    },
    explorer: {
        enabled: true,
        allowMobileDrawer: true,
        allowResize: true,
        showFilter: true,
        showActions: true,
        showHistoryControls: true,
        showFooter: true,
        showStdin: true,
        fileActions: { ...DEFAULT_IDE_FILE_ACTIONS },
    },
    editor: {
        showTabs: true,
        showEditor: true,
    },
    runner: {
        allowRun: true,
        showTerminal: true,
        showTerminalDockToggle: true,
        showOpenTerminalButton: true,
        showRestartTerminalButton: true,
        showThemeToggle: false,
        showSqlDialectPicker: true,
        enableWorkspaceTerminal: true,
        terminalSessionScope: "exercise",
    },
    projects: {
        showProjectSwitcher: true,
        showCloudProjects: true,
        showSaveControls: true,
        showSaveAs: true,
    },
};

const LESSON_PRESET: FullIDEServices = {
    chrome: {
        ...WORKSPACE_PRESET.chrome,
    },
    explorer: {
        ...WORKSPACE_PRESET.explorer,
        showActions: false,
        showHistoryControls: false,
        showFooter: false,
    },
    editor: {
        ...WORKSPACE_PRESET.editor,
        showTabs: false,
        showEditor: true,
    },
    runner: {
        ...WORKSPACE_PRESET.runner,
        showTerminalDockToggle: false,
        enableWorkspaceTerminal: false,
    },
    projects: {
        showProjectSwitcher: false,
        showCloudProjects: false,
        showSaveControls: false,
        showSaveAs: false,
    },
};

const RUNNER_PRESET: FullIDEServices = {
    chrome: {
        ...WORKSPACE_PRESET.chrome,
        showHeader: false,
        showActivePath: false,
        showTopLanguageButtons: false,
    },
    explorer: {
        ...WORKSPACE_PRESET.explorer,
        enabled: false,
        allowMobileDrawer: false,
        allowResize: false,
        showFilter: false,
        showActions: false,
        showHistoryControls: false,
        showFooter: false,
        showStdin: false,
    },
    editor: {
        showTabs: false,
        showEditor: true,
    },
    runner: {
        ...WORKSPACE_PRESET.runner,
        showTerminalDockToggle: false,
        enableWorkspaceTerminal: false,
    },
    projects: {
        showProjectSwitcher: false,
        showCloudProjects: false,
        showSaveControls: false,
        showSaveAs: false,
    },
};

const PRESETS: Record<FullIDEServicePreset, FullIDEServices> = {
    workspace: WORKSPACE_PRESET,
    lesson: LESSON_PRESET,
    runner: RUNNER_PRESET,
};
function mergeServices(base: FullIDEServices, overrides?: FullIDEServicesInput): FullIDEServices {
    const explorerOverrides = overrides?.explorer;

    return {
        chrome: {
            ...base.chrome,
            ...overrides?.chrome,
        },
        explorer: {
            ...base.explorer,
            ...explorerOverrides,
            fileActions: resolveFileActions(
                base.explorer.fileActions,
                explorerOverrides?.fileActions as Partial<ResolvedIdeFileActions> | undefined,
            ),
        },
        editor: {
            ...base.editor,
            ...overrides?.editor,
        },
        runner: {
            ...base.runner,
            ...overrides?.runner,
        },
        projects: {
            ...base.projects,
            ...overrides?.projects,
        },
    };
}
export function resolveFullIDEServices(args?: {
    preset?: FullIDEServicePreset;
    showTopLanguageButtons?: boolean;
    overrides?: FullIDEServicesInput;
}): FullIDEServices {
    const preset = args?.preset ?? "workspace";
    const base = PRESETS[preset];
    const merged = mergeServices(base, args?.overrides);

    if (args?.showTopLanguageButtons === false) {
        merged.chrome.showTopLanguageButtons = false;
    }

    if (!merged.runner.showTerminal) {
        merged.runner.showTerminalDockToggle = false;
        merged.runner.showOpenTerminalButton = false;
        merged.runner.showRestartTerminalButton = false;
        merged.runner.enableWorkspaceTerminal = false;
    }

    if (!merged.editor.showEditor) {
        merged.editor.showTabs = false;
    }

    const terminalOnly =
        !merged.editor.showEditor &&
        merged.runner.showTerminal &&
        merged.runner.enableWorkspaceTerminal;

    if (terminalOnly) {
        merged.explorer.enabled = false;
    }

    if (!merged.explorer.enabled) {
        merged.explorer.allowMobileDrawer = false;
        merged.explorer.allowResize = false;
        merged.explorer.showFilter = false;
        merged.explorer.showActions = false;
        merged.explorer.showHistoryControls = false;
        merged.explorer.showFooter = false;
        merged.explorer.showStdin = false;
        merged.explorer.fileActions = { ...DISABLED_IDE_FILE_ACTIONS };
    } else {
        merged.explorer.fileActions = resolveFileActions(merged.explorer.fileActions);
    }

    if (!merged.projects.showSaveControls) {
        merged.projects.showSaveAs = false;
    }

    return merged;
}
