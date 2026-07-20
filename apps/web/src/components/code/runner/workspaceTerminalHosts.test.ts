import { describe, expect, it } from "vitest";

import {
    buildWorkspaceTerminalHostKey,
    buildWorkspaceTerminalOwnerKey,
    canCreateWorkspaceTerminalTab,
} from "./workspaceTerminalHosts";

describe("workspace terminal identity", () => {
    it("isolates unrelated IDE experiences in the same browser window", () => {
        const gitHost = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: "project:git-foundations",
        });
        const pythonHost = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: "local::python-sandbox",
        });

        expect(gitHost).not.toBe(pythonHost);
        expect(
            buildWorkspaceTerminalOwnerKey({
                hostKey: gitHost,
                terminalId: "primary",
            }),
        ).not.toBe(
            buildWorkspaceTerminalOwnerKey({
                hostKey: pythonHost,
                terminalId: "primary",
            }),
        );
    });

    it("isolates browser windows even when they show the same project", () => {
        const firstWindowHost = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: "project:shared-project",
        });
        const secondWindowHost = buildWorkspaceTerminalHostKey({
            windowId: "window-b",
            experienceKey: "project:shared-project",
        });

        expect(firstWindowHost).not.toBe(secondWindowHost);
    });

    it("assigns a distinct owner to every terminal tab", () => {
        const hostKey = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: "project:shared-project",
        });

        expect(
            buildWorkspaceTerminalOwnerKey({ hostKey, terminalId: "terminal-1" }),
        ).not.toBe(
            buildWorkspaceTerminalOwnerKey({ hostKey, terminalId: "terminal-2" }),
        );
    });
});

describe("workspace terminal capacity", () => {
    it("allows a new terminal only when both the global and host limits have room", () => {
        expect(
            canCreateWorkspaceTerminalTab({
                activeCount: 2,
                terminalTabCount: 2,
                maxActiveSessions: 4,
            }),
        ).toBe(true);

        expect(
            canCreateWorkspaceTerminalTab({
                activeCount: 4,
                terminalTabCount: 1,
                maxActiveSessions: 4,
            }),
        ).toBe(false);

        expect(
            canCreateWorkspaceTerminalTab({
                activeCount: 1,
                terminalTabCount: 4,
                maxActiveSessions: 4,
            }),
        ).toBe(false);
    });
});
