import { describe, expect, it } from "vitest";
import {
    mergeLearningIdeConfigs,
    resolveFullIDEConfigFromLearningIde,
} from "@/lib/ide/learningIdeConfig";

describe("mergeLearningIdeConfigs", () => {
    it("preserves layoutMode, requirements, terminal cwd, bootstrap, and SQL options additively", () => {
        const merged = mergeLearningIdeConfigs(
            {
                runnerBackend: "pty",
                requires: {
                    files: true,
                    multiFile: true,
                },
                terminalBootstrap: {
                    gitSafeDirectories: ["/workspace/trail-journal"],
                },
                sqlPane: {
                    defaultTab: "results",
                },
            },
            {
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/navigation-practice",
                showOpenTerminalButton: false,
                showRestartTerminalButton: false,
                terminalBootstrap: {
                    gitSafeDirectories: ["/workspace/*", "/workspace/trail-journal"],
                },
                requires: {
                    terminal: true,
                },
                sqlPane: {
                    showErd: true,
                },
            },
        );

        expect(merged).toEqual({
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            terminalCwd: "/workspace/navigation-practice",
            showOpenTerminalButton: false,
            showRestartTerminalButton: false,
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/trail-journal", "/workspace/*"],
            },
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
            sqlPane: {
                defaultTab: "results",
                showErd: true,
            },
        });
    });

    it("merges fileActions additively across overrides", () => {
        const merged = mergeLearningIdeConfigs(
            {
                fileActions: {
                    enabled: true,
                    createFile: false,
                    createFolder: false,
                },
            },
            {
                fileActions: {
                    rename: false,
                },
            },
        );

        expect(merged).toEqual({
            fileActions: {
                enabled: true,
                createFile: false,
                createFolder: false,
                rename: false,
            },
        });
    });
});

describe("resolveFullIDEConfigFromLearningIde", () => {
    it("keeps the editor visible in default mode for normal Python file exercises", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                requires: {
                    files: true,
                    multiFile: true,
                },
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(true);
        expect(resolved.services.explorer?.allowMobileDrawer).toBe(true);
        expect(resolved.services.editor?.showEditor).toBe(true);
        expect(resolved.services.editor?.showTabs).toBe(true);
        expect(resolved.services.explorer?.fileActions).toEqual({
            enabled: true,
            createFile: true,
            createFolder: true,
            rename: true,
            delete: true,
            dragDrop: true,
        });
        expect(resolved.services.runner?.terminalSessionScope).toBe("exercise");
        expect(resolved.services.runner?.showTerminal).not.toBe(true);
        expect(resolved.access.canUseMultiFile).toBe(true);
    });


    it("does not inherit cloud project or upgrade controls from the workspace preset", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                preset: "workspace",
                requires: {
                    files: true,
                    multiFile: true,
                    terminal: true,
                },
            },
        });

        expect(resolved.services.projects).toEqual({
            showProjectSwitcher: false,
            showSaveControls: false,
            showSaveAs: false,
            showCloudProjects: false,
        });
        expect(resolved.access.canSaveCloud).toBe(false);
        expect(resolved.access.canCreateProjects).toBe(false);
    });

    it("enables project controls only when the learning contract requests them", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                requires: {
                    files: true,
                    projectPersistence: true,
                    cloudProjects: true,
                },
            },
        });

        expect(resolved.services.projects).toEqual({
            showProjectSwitcher: true,
            showSaveControls: true,
            showSaveAs: true,
            showCloudProjects: true,
        });
        expect(resolved.access.canSaveCloud).toBe(true);
        expect(resolved.access.canCreateProjects).toBe(true);
    });

    it("hides explorer, editor, and tabs in terminal_workspace mode", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
                requires: {
                    files: true,
                },
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(false);
        expect(resolved.services.explorer?.allowMobileDrawer).toBe(false);
        expect(resolved.services.explorer?.showActions).toBe(false);
        expect(resolved.services.editor?.showEditor).toBe(false);
        expect(resolved.services.editor?.showTabs).toBe(false);
        expect(resolved.services.explorer?.fileActions).toEqual({
            enabled: false,
            createFile: false,
            createFolder: false,
            rename: false,
            delete: false,
            dragDrop: false,
        });
        expect(resolved.services.runner?.terminalSessionScope).toBe("exercise");
        expect(resolved.access.canUseMultiFile).toBe(true);
    });

    it("keeps Run enabled for normal editor plus terminal exercises", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                requires: {
                    files: true,
                    multiFile: true,
                    terminal: true,
                },
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(true);
        expect(resolved.services.editor?.showEditor).toBe(true);
        expect(resolved.services.runner?.showTerminal).toBe(true);
        expect(resolved.services.runner?.enableWorkspaceTerminal).toBe(true);
        expect(resolved.services.runner?.allowRun).toBe(true);
        expect(resolved.services.runner?.showTerminalDockToggle).toBe(true);
        expect(resolved.services.runner?.showOpenTerminalButton).toBe(true);
        expect(resolved.services.runner?.showRestartTerminalButton).toBe(true);
    });

    it("enables terminal and workspace terminal in terminal_workspace mode", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(false);
        expect(resolved.services.runner?.showTerminal).toBe(true);
        expect(resolved.services.runner?.enableWorkspaceTerminal).toBe(true);
        expect(resolved.services.runner?.allowRun).toBe(false);
        expect(resolved.services.runner?.showTerminalDockToggle).toBe(false);
    });

    it("respects explicit terminal action visibility overrides", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                requires: {
                    terminal: true,
                },
                showOpenTerminalButton: false,
                showRestartTerminalButton: false,
            },
        });

        expect(resolved.services.runner?.showOpenTerminalButton).toBe(false);
        expect(resolved.services.runner?.showRestartTerminalButton).toBe(false);
    });

    it("respects an explicit terminalSessionScope override", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
                terminalSessionScope: "project",
            },
        });

        expect(resolved.services.runner?.terminalSessionScope).toBe("project");
    });

    it("passes a profile-authored terminal bootstrap to the shared runner", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                runnerBackend: "pty",
                terminalCwd: "/workspace/trail-journal",
                terminalBootstrap: {
                    gitSafeDirectories: ["/workspace/*"],
                },
                requires: {
                    files: true,
                    terminal: true,
                },
            },
        });

        expect(resolved.services.runner?.terminalBootstrap).toEqual({
            gitSafeDirectories: ["/workspace/*"],
        });
    });

    it("passes through an explicit terminalCwd override", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/park-terminal-map",
            },
        });

        expect(resolved.services.runner?.terminalCwd).toBe("/workspace/park-terminal-map");
    });

    it("respects explicit fileActions overrides in normal editor mode", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                requires: {
                    files: true,
                    multiFile: true,
                },
                fileActions: {
                    createFile: false,
                    createFolder: false,
                    dragDrop: false,
                },
            },
        });

        expect(resolved.services.explorer?.fileActions).toEqual({
            enabled: true,
            createFile: false,
            createFolder: false,
            rename: true,
            delete: true,
            dragDrop: false,
        });
    });
});
