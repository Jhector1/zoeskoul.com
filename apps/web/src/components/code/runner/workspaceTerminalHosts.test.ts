import { afterEach, describe, expect, it, vi } from "vitest";

import {
    buildWorkspaceTerminalHostKey,
    buildWorkspaceTerminalOwnerKey,
    canCreateWorkspaceTerminalTab,
    handoffWorkspaceTerminalHost,
    isWorkspaceTerminalOwnerReady,
    publishTerminalCapacityInvalidation,
    reconcileWorkspaceTerminalTabs,
    resetWorkspaceTerminalHostHandoffsForTests,
    resolveWorkspaceTerminalActivationFailure,
    resolveWorkspaceTerminalHydration,
    subscribeTerminalCapacityInvalidations,
} from "./workspaceTerminalHosts";


async function flushMicrotasksUntil(predicate: () => boolean, attempts = 10) {
    for (let attempt = 0; attempt < attempts && !predicate(); attempt += 1) {
        await Promise.resolve();
    }
}

function createDeferredVoid() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });

    return { promise, resolve };
}

afterEach(() => {
    resetWorkspaceTerminalHostHandoffsForTests();
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

    it("keeps review terminal owners distinct when the starter identity is very large", () => {
        const sharedPrefix = `review-tool:${"starter-workspace-json".repeat(80)}`;
        const firstHost = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: `${sharedPrefix}:exercise-a`,
        });
        const secondHost = buildWorkspaceTerminalHostKey({
            windowId: "window-a",
            experienceKey: `${sharedPrefix}:exercise-b`,
        });
        const firstOwner = buildWorkspaceTerminalOwnerKey({
            hostKey: firstHost,
            terminalId: "primary",
        });
        const secondOwner = buildWorkspaceTerminalOwnerKey({
            hostKey: firstHost,
            terminalId: "terminal-2",
        });

        expect(firstHost).not.toBe(secondHost);
        expect(firstOwner).not.toBe(secondOwner);
        expect(firstHost.length).toBeLessThanOrEqual(320);
        expect(firstOwner.length).toBeLessThanOrEqual(480);
    });
});

describe("workspace terminal host hydration", () => {
    it("activates the restored visible terminal instead of leaving it dormant", () => {
        expect(
            resolveWorkspaceTerminalHydration({
                tabs: [
                    { id: "primary", label: "Terminal 1" },
                    { id: "terminal-2", label: "Terminal 2" },
                ],
                activeId: "terminal-2",
            }),
        ).toEqual({
            tabs: [
                { id: "primary", label: "Terminal 1" },
                { id: "terminal-2", label: "Terminal 2" },
            ],
            activeId: "terminal-2",
            pendingStartId: "terminal-2",
            pendingStartMode: "attach",
        });
    });

    it("falls back to Terminal 1 and stages its activation", () => {
        expect(
            resolveWorkspaceTerminalHydration({
                tabs: [],
                activeId: "missing",
            }),
        ).toEqual({
            tabs: [{ id: "primary", label: "Terminal 1" }],
            activeId: "primary",
            pendingStartId: "primary",
            pendingStartMode: "attach",
        });
    });
});

describe("workspace terminal navigation handoff", () => {
    it("keeps the same host without canceling its live terminals", async () => {
        const cancelHost = vi.fn(async () => undefined);

        await expect(
            handoffWorkspaceTerminalHost({
                slotKey: "window-a",
                hostKey: "host-topic-a",
                cancelHost,
            }),
        ).resolves.toBe(true);
        await expect(
            handoffWorkspaceTerminalHost({
                slotKey: "window-a",
                hostKey: "host-topic-a",
                cancelHost,
            }),
        ).resolves.toBe(true);

        expect(cancelHost).not.toHaveBeenCalled();
    });

    it("releases the previous topic before allowing the next host to activate", async () => {
        const previousCancellation = createDeferredVoid();
        const cancelHost = vi.fn(() => previousCancellation.promise);

        await expect(
            handoffWorkspaceTerminalHost({
                slotKey: "window-a",
                hostKey: "host-topic-a",
                cancelHost,
            }),
        ).resolves.toBe(true);

        let activated = false;
        const nextActivation = handoffWorkspaceTerminalHost({
            slotKey: "window-a",
            hostKey: "host-topic-b",
            cancelHost,
        }).then((value) => {
            activated = value;
            return value;
        });

        await flushMicrotasksUntil(() => cancelHost.mock.calls.length > 0);
        expect(cancelHost).toHaveBeenCalledWith("host-topic-a");
        expect(activated).toBe(false);

        previousCancellation.resolve();

        await expect(nextActivation).resolves.toBe(true);
        expect(activated).toBe(true);
    });

    it("serializes rapid navigation and activates only the newest topic", async () => {
        const releases = new Map<string, () => void>();
        const cancelHost = vi.fn(
            (hostKey: string) =>
                new Promise<void>((resolve) => {
                    releases.set(hostKey, resolve);
                }),
        );

        await handoffWorkspaceTerminalHost({
            slotKey: "window-a",
            hostKey: "host-topic-a",
            cancelHost,
        });

        const topicB = handoffWorkspaceTerminalHost({
            slotKey: "window-a",
            hostKey: "host-topic-b",
            cancelHost,
        });
        const topicC = handoffWorkspaceTerminalHost({
            slotKey: "window-a",
            hostKey: "host-topic-c",
            cancelHost,
        });

        await flushMicrotasksUntil(() => cancelHost.mock.calls.length > 0);
        expect(cancelHost).toHaveBeenCalledWith("host-topic-a");
        releases.get("host-topic-a")?.();

        await expect(topicB).resolves.toBe(false);
        await expect(topicC).resolves.toBe(true);
        expect(cancelHost).toHaveBeenCalledTimes(1);
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
