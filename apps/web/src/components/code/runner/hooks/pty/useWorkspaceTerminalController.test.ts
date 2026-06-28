import { describe, expect, it } from "vitest";

import { shouldPrimeWorkspacePrompt } from "./useWorkspaceTerminalController";

describe("shouldPrimeWorkspacePrompt", () => {
    it("returns true when the workspace terminal is interactive but still visually blank", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(true);
    });

    it("returns false once the terminal has already rendered visible output", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: true,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);
    });

    it("returns false while startup input is still queued", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: "cd -- /workspace/project\n",
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);
    });

    it("returns false when the session is not in a safe state to poke", () => {
        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: null,
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: false,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: true,
                restarting: false,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: true,
                terminalProcessExited: false,
            }),
        ).toBe(false);

        expect(
            shouldPrimeWorkspacePrompt({
                sessionId: "session-123",
                workspaceReady: true,
                terminalHasVisibleOutput: false,
                pendingStartupInput: null,
                stopping: false,
                restarting: false,
                terminalProcessExited: true,
            }),
        ).toBe(false);
    });
});
