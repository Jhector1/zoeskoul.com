import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
    new URL("./CodeRunner.tsx", import.meta.url),
    "utf8",
);

describe("Linux terminal automatic startup uses the existing PTY controller", () => {
    it("defaults available Bash terminals to the Terminal tab without overriding authored Output", () => {
        expect(source).toContain('if (authored === "output") return "output";');
        expect(source).toContain('args.language === "bash" && args.terminalAvailable');
        expect(source.match(/resolveRunnerPaneDefaultTab\(\{\s*policy: runnerPaneOptions,\s*language: lang,/g)).toHaveLength(2);
    });

    it("does not start an invisible Tools Code pane or background browser tab", () => {
        expect(source).toContain('document.visibilityState === "visible"');
        expect(source).toContain("!root.closest('[aria-hidden=\"true\"]')");
        expect(source).toContain('surfaceActive: terminalSurfaceActive');
        expect(source).toContain('args.surfaceActive === false');
    });

    it("keeps existing authorization and bounded anti-hammer startup", () => {
        expect(source).toContain('isAuthenticated === true');
        expect(source).toContain('shouldClaimTerminalAutoOpen(terminalAutoOpenKey)');
        expect(source).toContain('workspaceTerm.open({ userInitiated: false })');
        expect(source).toContain('TERMINAL_AUTO_OPEN_MAX_RECOVERY_ATTEMPTS');
        expect(source).toContain('!(lang === "bash" && runnerPaneDefaultTab === "terminal")');
        expect(source).toContain('showRestartTerminalButton !== false');
    });
});
