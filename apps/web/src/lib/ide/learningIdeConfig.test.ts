import { describe, expect, it } from "vitest";
import {
    mergeLearningIdeConfigs,
    resolveFullIDEConfigFromLearningIde,
} from "@/lib/ide/learningIdeConfig";

describe("mergeLearningIdeConfigs", () => {
    it("preserves layoutMode, requires, runnerBackend, and sqlPane additively", () => {
        const merged = mergeLearningIdeConfigs(
            {
                runnerBackend: "pty",
                requires: {
                    files: true,
                    multiFile: true,
                },
                sqlPane: {
                    defaultTab: "results",
                },
            },
            {
                layoutMode: "terminal_workspace",
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

    it("hides editor and tabs in terminal_workspace mode", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
                requires: {
                    files: true,
                },
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(true);
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
        expect(resolved.services.runner?.terminalSessionScope).toBe("topic");
        expect(resolved.access.canUseMultiFile).toBe(true);
    });

    it("enables terminal and workspace terminal in terminal_workspace mode", () => {
        const resolved = resolveFullIDEConfigFromLearningIde({
            ideConfig: {
                layoutMode: "terminal_workspace",
            },
        });

        expect(resolved.services.explorer?.enabled).toBe(true);
        expect(resolved.services.runner?.showTerminal).toBe(true);
        expect(resolved.services.runner?.enableWorkspaceTerminal).toBe(true);
        expect(resolved.services.runner?.allowRun).toBe(false);
        expect(resolved.services.runner?.showTerminalDockToggle).toBe(false);
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
