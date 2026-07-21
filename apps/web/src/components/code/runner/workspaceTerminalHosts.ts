"use client";

import { compactTerminalIdentityKey } from "./terminalIdentity";

export type WorkspaceTerminalTab = {
    id: string;
    label: string;
};

export type TerminalCapacity = {
    activeCount: number;
    maxActiveSessions: number;
    hostActiveOwnerKeys: string[];
};

export type WorkspaceTerminalHydration = {
    tabs: WorkspaceTerminalTab[];
    activeId: string;
    pendingStartId: string;
    pendingStartMode: "attach";
};

/**
 * Hydrating a host is also an activation transaction for its visible tab.
 * Keeping this policy outside CodeRunner prevents review-route remounts from
 * rendering a dormant Idle terminal and waiting for a separate auto-open pass.
 */
export function resolveWorkspaceTerminalHydration(args: {
    tabs: WorkspaceTerminalTab[];
    activeId: string;
}): WorkspaceTerminalHydration {
    const tabs = args.tabs.length
        ? args.tabs
        : [{ id: "primary", label: "Terminal 1" }];
    const activeId = tabs.some((tab) => tab.id === args.activeId)
        ? args.activeId
        : tabs[0].id;

    return {
        tabs,
        activeId,
        pendingStartId: activeId,
        pendingStartMode: "attach",
    };
}

export function isWorkspaceTerminalOwnerReady(args: {
    activeOwnerKey: string | null;
    attachedOwnerKey: string | null;
    sessionId: string | null;
    interactiveReady: boolean;
    starting: boolean;
    stopping: boolean;
    restarting: boolean;
}) {
    return Boolean(
        args.activeOwnerKey &&
            args.attachedOwnerKey === args.activeOwnerKey &&
            args.sessionId &&
            args.interactiveReady &&
            !args.starting &&
            !args.stopping &&
            !args.restarting,
    );
}

export function resolveWorkspaceTerminalActivationFailure(args: {
    tabs: WorkspaceTerminalTab[];
    startingTerminalId: string;
    previousTerminalId: string;
    mode: "create" | "attach";
}) {
    const tabs =
        args.mode === "create"
            ? args.tabs.filter((tab) => tab.id !== args.startingTerminalId)
            : args.tabs;
    const fallbackTerminalId = tabs.some(
        (tab) =>
            tab.id === args.previousTerminalId &&
            tab.id !== args.startingTerminalId,
    )
        ? args.previousTerminalId
        : null;

    return { tabs, fallbackTerminalId };
}

export function canCreateWorkspaceTerminalTab(args: {
    activeCount: number;
    terminalTabCount: number;
    maxActiveSessions: number;
    activeTerminalReady?: boolean;
}) {
    const max = Math.max(1, Math.floor(args.maxActiveSessions));

    return (
        args.activeTerminalReady !== false &&
        args.activeCount < max &&
        args.terminalTabCount < max
    );
}

export function reconcileWorkspaceTerminalTabs(args: {
    hostKey: string;
    tabs: WorkspaceTerminalTab[];
    activeId: string;
    liveOwnerKeys: string[];
}) {
    const liveOwners = new Set(args.liveOwnerKeys);
    const tabs = args.tabs.filter((tab) => {
        if (tab.id === "primary") return true;

        return liveOwners.has(
            buildWorkspaceTerminalOwnerKey({
                hostKey: args.hostKey,
                terminalId: tab.id,
            }),
        );
    });
    const safeTabs = tabs.length
        ? tabs
        : [{ id: "primary", label: "Terminal 1" }];
    const activeId = safeTabs.some((tab) => tab.id === args.activeId)
        ? args.activeId
        : safeTabs[0].id;

    return { tabs: safeTabs, activeId };
}

const HOST_CLEANUP_GRACE_MS = 5_000;
const TERMINAL_CAPACITY_CHANNEL = "zoeskoul.terminal.capacity.v1";
const TERMINAL_CAPACITY_STORAGE_KEY = "zoeskoul.terminal.capacity.signal.v1";
const hostCleanupTimers = new Map<string, number>();

type TerminalHostHandoffSlot = {
    activeHostKey: string | null;
    desiredHostKey: string | null;
    generation: number;
    tail: Promise<void>;
};

const terminalHostHandoffSlots = new Map<string, TerminalHostHandoffSlot>();
let runtimeWindowId: string | null = null;

function randomId(prefix: string) {
    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${prefix}-${id}`;
}

export function getOrCreateTerminalWindowId() {
    if (runtimeWindowId) return runtimeWindowId;

    runtimeWindowId = randomId("window");
    return runtimeWindowId;
}

export function buildWorkspaceTerminalHostKey(args: {
    windowId: string;
    experienceKey: string;
}) {
    const experienceKey = compactTerminalIdentityKey(args.experienceKey, 240);

    return compactTerminalIdentityKey(
        `terminal-host-v2:${args.windowId}:${experienceKey}`,
        320,
    );
}

export function buildWorkspaceTerminalOwnerKey(args: {
    hostKey: string;
    terminalId: string;
}) {
    return compactTerminalIdentityKey(
        `${args.hostKey}:owner:${args.terminalId}`,
        480,
    );
}

function tabsStorageKey(hostKey: string) {
    return `zoeskoul.terminal.tabs.v1:${hostKey}`;
}

export function loadWorkspaceTerminalTabs(hostKey: string): {
    tabs: WorkspaceTerminalTab[];
    activeId: string;
} {
    const fallback = {
        tabs: [{ id: "primary", label: "Terminal 1" }],
        activeId: "primary",
    };

    try {
        const raw = window.sessionStorage.getItem(tabsStorageKey(hostKey));
        if (!raw) return fallback;

        const parsed = JSON.parse(raw) as {
            tabs?: WorkspaceTerminalTab[];
            activeId?: string;
        };
        const tabs = Array.isArray(parsed.tabs)
            ? parsed.tabs.filter(
                  (tab): tab is WorkspaceTerminalTab =>
                      Boolean(tab?.id && tab?.label),
              )
            : [];

        if (!tabs.length) return fallback;

        const activeId = tabs.some((tab) => tab.id === parsed.activeId)
            ? String(parsed.activeId)
            : tabs[0].id;

        return { tabs, activeId };
    } catch {
        return fallback;
    }
}

export function saveWorkspaceTerminalTabs(
    hostKey: string,
    tabs: WorkspaceTerminalTab[],
    activeId: string,
) {
    try {
        window.sessionStorage.setItem(
            tabsStorageKey(hostKey),
            JSON.stringify({ tabs, activeId }),
        );
    } catch {
        // Session persistence is a convenience; terminal ownership remains safe.
    }
}

export function createWorkspaceTerminalTab(index: number): WorkspaceTerminalTab {
    return {
        id: randomId("terminal"),
        label: `Terminal ${index}`,
    };
}

export async function readTerminalCapacity(
    hostKey?: string | null,
): Promise<TerminalCapacity> {
    const query = hostKey
        ? `?hostKey=${encodeURIComponent(hostKey)}`
        : "";
    const response = await fetch(`/api/run/pty/sessions/active${query}`, {
        method: "GET",
        cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as
        | ({ ok: true } & TerminalCapacity)
        | { ok: false; error: string }
        | null;

    if (!response.ok || !data?.ok) {
        throw new Error(data && "error" in data ? data.error : "Could not read terminal capacity.");
    }

    return {
        activeCount: data.activeCount,
        maxActiveSessions: data.maxActiveSessions,
        hostActiveOwnerKeys: Array.isArray(data.hostActiveOwnerKeys)
            ? data.hostActiveOwnerKeys.filter((value): value is string =>
                  typeof value === "string" && Boolean(value),
              )
            : [],
    };
}

export type TerminalCapacityInvalidationReason =
    | "session-started"
    | "session-closed"
    | "host-closing"
    | "host-cleaned"
    | "capacity-changed";

type TerminalCapacityInvalidation = {
    id: string;
    reason: TerminalCapacityInvalidationReason;
    at: number;
};

/**
 * Tell every other same-origin IDE tab that the runner capacity may have
 * changed. The message is only an invalidation signal: receivers always read
 * the authoritative count from the runner instead of trusting browser state.
 */
export function publishTerminalCapacityInvalidation(
    reason: TerminalCapacityInvalidationReason = "capacity-changed",
) {
    const signal: TerminalCapacityInvalidation = {
        id: randomId("capacity"),
        reason,
        at: Date.now(),
    };

    try {
        if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel(TERMINAL_CAPACITY_CHANNEL);
            channel.postMessage(signal);
            channel.close();
        }
    } catch {
        // localStorage remains as the cross-tab fallback.
    }

    try {
        window.localStorage.setItem(
            TERMINAL_CAPACITY_STORAGE_KEY,
            JSON.stringify(signal),
        );
        window.localStorage.removeItem(TERMINAL_CAPACITY_STORAGE_KEY);
    } catch {
        // Privacy-restricted browsers can disable localStorage. Polling and
        // focus/visibility refreshes still converge with runner state.
    }
}

export function subscribeTerminalCapacityInvalidations(
    listener: (signal: TerminalCapacityInvalidation) => void,
) {
    let channel: BroadcastChannel | null = null;

    const readSignal = (value: unknown): TerminalCapacityInvalidation | null => {
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<TerminalCapacityInvalidation>;
        if (
            typeof candidate.id !== "string" ||
            typeof candidate.reason !== "string" ||
            typeof candidate.at !== "number"
        ) {
            return null;
        }

        return candidate as TerminalCapacityInvalidation;
    };

    try {
        if (typeof BroadcastChannel !== "undefined") {
            channel = new BroadcastChannel(TERMINAL_CAPACITY_CHANNEL);
            channel.onmessage = (event: MessageEvent<unknown>) => {
                const signal = readSignal(event.data);
                if (signal) listener(signal);
            };
        }
    } catch {
        channel = null;
    }

    const handleStorage = (event: StorageEvent) => {
        if (
            event.key !== TERMINAL_CAPACITY_STORAGE_KEY ||
            !event.newValue
        ) {
            return;
        }

        try {
            const signal = readSignal(JSON.parse(event.newValue));
            if (signal) listener(signal);
        } catch {
            // Ignore malformed or unrelated storage events.
        }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
        window.removeEventListener("storage", handleStorage);
        if (channel) {
            channel.onmessage = null;
            channel.close();
        }
    };
}


/**
 * Atomically move one browser terminal surface from its previous host to the
 * next host. The old host is canceled before the new host is allowed to mount
 * a controller, so a topic transition can never temporarily request a third
 * PTY while the learner is already at the runner limit.
 *
 * The slot survives React unmount/remount cycles inside this browser runtime.
 * Same-host remounts therefore keep their terminals, while a genuinely new
 * host performs an immediate handoff instead of waiting for the cleanup grace
 * timer. Rapid A -> B -> C navigation is serialized and only the latest host
 * receives permission to activate.
 */
export async function handoffWorkspaceTerminalHost(args: {
    slotKey: string;
    hostKey: string;
    cancelHost?: (hostKey: string) => Promise<void>;
}): Promise<boolean> {
    const slotKey = String(args.slotKey ?? "").trim();
    const hostKey = String(args.hostKey ?? "").trim();

    if (!slotKey || !hostKey) return false;

    let slot = terminalHostHandoffSlots.get(slotKey);
    if (!slot) {
        slot = {
            activeHostKey: null,
            desiredHostKey: null,
            generation: 0,
            tail: Promise.resolve(),
        };
        terminalHostHandoffSlots.set(slotKey, slot);
    }

    const generation = slot.generation + 1;
    slot.generation = generation;
    slot.desiredHostKey = hostKey;
    clearScheduledTerminalHostCleanup(hostKey);

    const cancelHost = args.cancelHost ?? cancelWorkspaceTerminalHost;
    let activated = false;

    const transition = slot.tail
        .catch(() => undefined)
        .then(async () => {
            const activeHostKey = slot?.activeHostKey ?? null;

            if (activeHostKey && activeHostKey !== hostKey) {
                clearScheduledTerminalHostCleanup(activeHostKey);

                try {
                    await cancelHost(activeHostKey);
                } catch (error) {
                    // Keep the ordinary grace cleanup as a fallback if the
                    // immediate navigation handoff is temporarily unavailable.
                    scheduleTerminalHostCleanup(activeHostKey);
                    throw error;
                }

                if (slot?.activeHostKey === activeHostKey) {
                    slot.activeHostKey = null;
                }
            }

            if (
                !slot ||
                slot.generation !== generation ||
                slot.desiredHostKey !== hostKey
            ) {
                return;
            }

            clearScheduledTerminalHostCleanup(hostKey);
            slot.activeHostKey = hostKey;
            activated = true;
        });

    slot.tail = transition.then(
        () => undefined,
        () => undefined,
    );

    await transition;
    return activated;
}

/** Test-only reset for the module-level browser handoff coordinator. */
export function resetWorkspaceTerminalHostHandoffsForTests() {
    terminalHostHandoffSlots.clear();
}

export async function cancelWorkspaceTerminalOwner(ownerKey: string) {
    const response = await fetch("/api/run/pty/sessions/owners/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerKey }),
        keepalive: true,
    });

    if (!response.ok) {
        throw new Error("Could not close the terminal session.");
    }

    publishTerminalCapacityInvalidation("session-closed");
}

export function clearScheduledTerminalHostCleanup(hostKey: string) {
    const timer = hostCleanupTimers.get(hostKey);
    if (timer != null) {
        window.clearTimeout(timer);
        hostCleanupTimers.delete(hostKey);
    }
}

export async function heartbeatTerminalHost(hostKey: string) {
    await fetch("/api/run/pty/sessions/hosts/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostKey }),
    }).catch(() => null);
}

export async function cancelWorkspaceTerminalHost(hostKey: string) {
    const response = await fetch("/api/run/pty/sessions/hosts/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostKey }),
        keepalive: true,
    });

    if (!response.ok) {
        throw new Error("Could not close the terminal host.");
    }

    publishTerminalCapacityInvalidation("host-cleaned");
}

export function cancelTerminalHostNow(hostKey: string) {
    const body = JSON.stringify({ hostKey });

    // Notify sibling IDE tabs before this browsing context disappears. They
    // retry the runner read while the beacon cancellation completes.
    publishTerminalCapacityInvalidation("host-closing");

    try {
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
            const blob = new Blob([body], { type: "application/json" });
            if (navigator.sendBeacon("/api/run/pty/sessions/hosts/cancel", blob)) {
                return;
            }
        }
    } catch {
        // Fall back to keepalive fetch.
    }

    void fetch("/api/run/pty/sessions/hosts/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
    }).catch(() => null);
}

export function scheduleTerminalHostCleanup(hostKey: string) {
    clearScheduledTerminalHostCleanup(hostKey);

    const timer = window.setTimeout(() => {
        hostCleanupTimers.delete(hostKey);
        publishTerminalCapacityInvalidation("host-closing");

        void fetch("/api/run/pty/sessions/hosts/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hostKey }),
            keepalive: true,
        })
            .catch(() => null)
            .finally(() => {
                publishTerminalCapacityInvalidation("host-cleaned");
            });
    }, HOST_CLEANUP_GRACE_MS);

    hostCleanupTimers.set(hostKey, timer);
}
