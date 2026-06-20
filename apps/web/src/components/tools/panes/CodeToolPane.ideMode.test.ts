import { describe, expect, it } from "vitest";
import { resolveCodeToolPaneFullIdeMode } from "@/components/tools/panes/CodeToolPane";

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
});
