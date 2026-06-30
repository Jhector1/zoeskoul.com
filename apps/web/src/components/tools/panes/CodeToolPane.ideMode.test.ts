import { describe, expect, it } from "vitest";
import {
    resolveCodeToolPaneFullIdeMode,
    resolveEffectiveCodeToolPaneIdeConfig,
} from "@/components/tools/panes/CodeToolPane";

describe("resolveCodeToolPaneFullIdeMode", () => {
    it("uses the existing FullIDE workspace shell for terminal_workspace tasks", () => {
        const resolved = resolveCodeToolPaneFullIdeMode({
            ideConfig: {
                layoutMode: "terminal_workspace",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            reviewDirectWorkspaceReady: false,
            effectiveLanguage: "bash",
        });

        expect(resolved.usesWorkspaceShell).toBe(true);
        expect(resolved.forceDesktopLayout).toBe(false);
        expect(resolved.fullIdeTitle).toBe("Linux terminal");
        expect(resolved.ideShell.services.explorer?.enabled).toBe(false);
        expect(resolved.ideShell.services.editor?.showEditor).toBe(false);
        expect(resolved.ideShell.services.runner?.showTerminal).toBe(true);
        expect(resolved.ideShell.services.runner?.allowRun).toBe(false);
    });


    it("lets the active runtime cwd override stale tool prop cwd in review mode", () => {
        const resolved = resolveEffectiveCodeToolPaneIdeConfig({
            isReviewRouteMode: true,
            propIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace",
                terminalSessionScope: "topic",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            exerciseIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/park-terminal-map",
                terminalSessionScope: "exercise",
            },
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
        expect(resolved?.requires?.files).toBe(true);
        expect(resolved?.terminalSessionScope).toBe("exercise");
    });

    it("keeps existing non-terminal file exercises editor-visible", () => {
        const resolved = resolveCodeToolPaneFullIdeMode({
            ideConfig: {
                requires: {
                    files: true,
                    multiFile: true,
                },
            },
            reviewDirectWorkspaceReady: false,
            effectiveLanguage: "python",
        });

        expect(resolved.usesWorkspaceShell).toBe(true);
        expect(resolved.forceDesktopLayout).toBe(false);
        expect(resolved.fullIdeTitle).toBe("Run code");
        expect(resolved.ideShell.services.explorer?.enabled).toBe(true);
        expect(resolved.ideShell.services.editor?.showEditor).toBe(true);
        expect(resolved.ideShell.services.runner?.showTerminal).not.toBe(true);
    });

    it("lets the currently bound runtime exercise cwd override stale tool props in review mode", () => {
        const resolved = resolveEffectiveCodeToolPaneIdeConfig({
            isReviewRouteMode: true,
            propIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace",
                terminalSessionScope: "exercise",
                requires: {
                    files: true,
                    terminal: true,
                },
            },
            exerciseIdeConfig: {
                runnerBackend: "pty",
                layoutMode: "terminal_workspace",
                terminalCwd: "/workspace/park-terminal-map",
                terminalSessionScope: "exercise",
            },
        });

        expect(resolved?.terminalCwd).toBe("/workspace/park-terminal-map");
        expect(resolved?.requires?.files).toBe(true);
        expect(resolved?.terminalSessionScope).toBe("exercise");
    });
});
