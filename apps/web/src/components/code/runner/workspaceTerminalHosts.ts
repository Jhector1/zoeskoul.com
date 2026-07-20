"use client";

export type WorkspaceTerminalTab = {
    id: string;
    label: string;
};

export type TerminalCapacity = {
    activeCount: number;
    maxActiveSessions: number;
};

export function canCreateWorkspaceTerminalTab(args: {
    activeCount: number;
    terminalTabCount: number;
    maxActiveSessions: number;
}) {
    const max = Math.max(1, Math.floor(args.maxActiveSessions));

    return args.activeCount < max && args.terminalTabCount < max;
}

const HOST_CLEANUP_GRACE_MS = 5_000;
const hostCleanupTimers = new Map<string, number>();
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
    return `terminal-host-v1:${args.windowId}:${args.experienceKey}`;
}

export function buildWorkspaceTerminalOwnerKey(args: {
    hostKey: string;
    terminalId: string;
}) {
    return `${args.hostKey}:owner:${args.terminalId}`;
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

export async function readTerminalCapacity(): Promise<TerminalCapacity> {
    const response = await fetch("/api/run/pty/sessions/active", {
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
    };
}

export async function cancelWorkspaceTerminalOwner(ownerKey: string) {
    await fetch("/api/run/pty/sessions/owners/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerKey }),
        keepalive: true,
    }).catch(() => null);
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

export function cancelTerminalHostNow(hostKey: string) {
    const body = JSON.stringify({ hostKey });

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

        void fetch("/api/run/pty/sessions/hosts/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hostKey }),
            keepalive: true,
        }).catch(() => null);
    }, HOST_CLEANUP_GRACE_MS);

    hostCleanupTimers.set(hostKey, timer);
}
