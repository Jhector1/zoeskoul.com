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

    it("paces automatic starts across Try changes without weakening the Runner limit", () => {
        expect(source).toContain('AUTOMATIC_TERMINAL_START_BUDGET = 4');
        expect(source).toContain('AUTOMATIC_TERMINAL_START_WINDOW_MS = 60_000');
        expect(source).toContain('automaticTerminalStartWait()');
        expect(source).toContain('reserveAutomaticTerminalStart()');
        expect(source).toContain('terminal-auto-start-paced');
        expect(source).toContain('setTerminalAutoOpenRetryTick((value) => value + 1)');
        expect(source).not.toContain('forceNewSession: true');
    });

    it("paces the pending terminal hydration path as well as normal auto-open", () => {
        const pending = source.split("const startingOwnerKey = pendingTerminalOwnerKey;")[1]
            ?.split("if (!pendingTerminalStartId || !pendingWorkspaceTerminalReady)")[0] ?? "";
        expect(pending).toContain("const initialWaitMs = automaticTerminalStartWait()");
        expect(pending).toContain("const latestWaitMs = reserveAutomaticTerminalStart()");
        expect(pending).toContain("setAutomaticTerminalDeferredUntil(Date.now() + initialWaitMs)");
        expect(pending).toContain("noteRunnerTerminalStartRateLimit()");
        expect(pending).toContain("terminalAutoOpenRetryTick,");
        expect(pending).not.toContain("forceNew: true");
    });

    it("preserves the explicit Runner recovery, owner and workspace boundaries", () => {
        expect(source).toContain("resolveWorkspaceTerminalHydration(restored)");
        expect(source).toContain("handoffWorkspaceTerminalHost({");
        expect(source).toContain("buildWorkspaceTerminalOwnerKey({");
        expect(source).toContain("terminalWorkspaceIdentityKey");
        expect(source).toContain("terminalAutoOpenRequestedKeyRef");
    });

    it("initializes terminal pacing state before the pending hydration effect reads it", () => {
        const retryDeclaration = source.indexOf(
            "const [terminalAutoOpenRetryTick, setTerminalAutoOpenRetryTick] = useState(0)",
        );
        const deferredDeclaration = source.indexOf(
            "const [automaticTerminalDeferredUntil, setAutomaticTerminalDeferredUntil] = useState<number | null>(null)",
        );
        const pendingEffect = source.indexOf(
            "const startingOwnerKey = pendingTerminalOwnerKey;",
        );
        const retryDependency = source.indexOf(
            "terminalAutoOpenRetryTick,",
            pendingEffect,
        );

        expect(retryDeclaration).toBeGreaterThan(-1);
        expect(deferredDeclaration).toBeGreaterThan(-1);
        expect(pendingEffect).toBeGreaterThan(-1);
        expect(retryDependency).toBeGreaterThan(pendingEffect);
        expect(retryDeclaration).toBeLessThan(pendingEffect);
        expect(deferredDeclaration).toBeLessThan(pendingEffect);
        expect(source.match(/const \[terminalAutoOpenRetryTick, setTerminalAutoOpenRetryTick\]/g)).toHaveLength(1);
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
