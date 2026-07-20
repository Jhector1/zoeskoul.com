import { afterEach, describe, expect, it, vi } from "vitest";

import {
    buildWorkspaceTerminalHostKey,
    buildWorkspaceTerminalOwnerKey,
    canCreateWorkspaceTerminalTab,
    isWorkspaceTerminalOwnerReady,
    publishTerminalCapacityInvalidation,
    reconcileWorkspaceTerminalTabs,
    resolveWorkspaceTerminalActivationFailure,
    subscribeTerminalCapacityInvalidations,
} from "./workspaceTerminalHosts";


afterEach(() => {
    vi.unstubAllGlobals();
});

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

    it("does not create a UI-only tab while the current terminal is still starting", () => {
        expect(
            canCreateWorkspaceTerminalTab({
                activeCount: 1,
                terminalTabCount: 1,
                maxActiveSessions: 4,
                activeTerminalReady: false,
            }),
        ).toBe(false);
    });

    it("drops persisted tabs that no longer own a live runner session", () => {
        const hostKey = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: "project:shared-project",
        });
        const liveOwner = buildWorkspaceTerminalOwnerKey({
            hostKey,
            terminalId: "terminal-live",
        });

        expect(
            reconcileWorkspaceTerminalTabs({
                hostKey,
                tabs: [
                    { id: "primary", label: "Terminal 1" },
                    { id: "terminal-live", label: "Terminal 2" },
                    { id: "terminal-stale", label: "Terminal 3" },
                ],
                activeId: "terminal-stale",
                liveOwnerKeys: [liveOwner],
            }),
        ).toEqual({
            tabs: [
                { id: "primary", label: "Terminal 1" },
                { id: "terminal-live", label: "Terminal 2" },
            ],
            activeId: "primary",
        });
    });
});


describe("workspace terminal owner switching", () => {
    it("does not treat the previous terminal controller as ready for a newly selected tab", () => {
        expect(
            isWorkspaceTerminalOwnerReady({
                activeOwnerKey: "host:owner:terminal-2",
                attachedOwnerKey: "host:owner:terminal-1",
                sessionId: "session-terminal-1",
                interactiveReady: true,
                starting: false,
                stopping: false,
                restarting: false,
            }),
        ).toBe(false);
    });

    it("marks a terminal ready only after its own owner has attached and become interactive", () => {
        expect(
            isWorkspaceTerminalOwnerReady({
                activeOwnerKey: "host:owner:terminal-2",
                attachedOwnerKey: "host:owner:terminal-2",
                sessionId: "session-terminal-2",
                interactiveReady: true,
                starting: false,
                stopping: false,
                restarting: false,
            }),
        ).toBe(true);
    });
});


describe("workspace terminal activation rollback", () => {
    const tabs = [
        { id: "primary", label: "Terminal 1" },
        { id: "terminal-2", label: "Terminal 2" },
    ];

    it("removes only a newly created tab when its session fails to start", () => {
        expect(
            resolveWorkspaceTerminalActivationFailure({
                tabs,
                startingTerminalId: "terminal-2",
                previousTerminalId: "primary",
                mode: "create",
            }),
        ).toEqual({
            tabs: [{ id: "primary", label: "Terminal 1" }],
            fallbackTerminalId: "primary",
        });
    });

    it("keeps an existing terminal tab when reattachment temporarily fails", () => {
        expect(
            resolveWorkspaceTerminalActivationFailure({
                tabs,
                startingTerminalId: "terminal-2",
                previousTerminalId: "primary",
                mode: "attach",
            }),
        ).toEqual({
            tabs,
            fallbackTerminalId: "primary",
        });
    });
});

describe("workspace terminal capacity synchronization", () => {
    it("notifies another browser tab to reread runner capacity", () => {
        type ChannelInstance = {
            name: string;
            onmessage: ((event: { data: unknown }) => void) | null;
            close: () => void;
        };
        const instances = new Set<ChannelInstance>();

        class FakeBroadcastChannel implements ChannelInstance {
            onmessage: ((event: { data: unknown }) => void) | null = null;

            constructor(public name: string) {
                instances.add(this);
            }

            postMessage(data: unknown) {
                for (const instance of instances) {
                    if (instance !== this && instance.name === this.name) {
                        instance.onmessage?.({ data });
                    }
                }
            }

            close() {
                instances.delete(this);
            }
        }

        vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
        vi.stubGlobal("window", {
            localStorage: {
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });

        const listener = vi.fn();
        const unsubscribe = subscribeTerminalCapacityInvalidations(listener);

        publishTerminalCapacityInvalidation("session-closed");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ reason: "session-closed" }),
        );

        unsubscribe();
        expect(instances.size).toBe(0);
    });
});
