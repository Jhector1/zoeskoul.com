export type FullIDEExplorerServices = {
    enabled: boolean;
    allowMobileDrawer: boolean;
    allowResize: boolean;
    showFilter: boolean;
    showActions: boolean;
    showHistoryControls: boolean;
    showFooter: boolean;
    showStdin: boolean;
};

export type FullIDEEditorServices = {
    showTabs: boolean;
};

export type FullIDERunnerServices = {
    allowRun: boolean;
    showTerminal: boolean;
    showTerminalDockToggle: boolean;
    showThemeToggle: boolean;
    showSqlDialectPicker: boolean;
    enableWorkspaceTerminal: boolean;
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
    },
    editor: {
        showTabs: true,
    },
    runner: {
        allowRun: true,
        showTerminal: true,
        showTerminalDockToggle: true,
        showThemeToggle: false,
        showSqlDialectPicker: true,
        enableWorkspaceTerminal: true,
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
    return {
        chrome: {
            ...base.chrome,
            ...overrides?.chrome,
        },
        explorer: {
            ...base.explorer,
            ...overrides?.explorer,
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

    if (!merged.explorer.enabled) {
        merged.explorer.allowMobileDrawer = false;
        merged.explorer.allowResize = false;
        merged.explorer.showFilter = false;
        merged.explorer.showActions = false;
        merged.explorer.showHistoryControls = false;
        merged.explorer.showFooter = false;
        merged.explorer.showStdin = false;
    }

    if (!merged.projects.showSaveControls) {
        merged.projects.showSaveAs = false;
    }

    if (!merged.runner.showTerminal) {
        merged.runner.showTerminalDockToggle = false;
        merged.runner.enableWorkspaceTerminal = false;
    }

    return merged;
}
