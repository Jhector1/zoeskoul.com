import { env } from "../../lib/env.js";
import {
    getAllSessions,
    getSession,
    pushEvent,
} from "./sessionStore.js";
import { killSession } from "../docker/killSession.js";
import { runScheduledWorkspaceCleanupNow } from "../workspace/cleanupWorkspace.js";
import {
    getDirectoryUsage,
    getRunnerFilesystemCapacity,
} from "../workspace/workspacePolicy.js";

const wallTimers = new Map<string, NodeJS.Timeout>();
const idleTimers = new Map<string, NodeJS.Timeout>();
const hardLifetimeTimers = new Map<string, NodeJS.Timeout>();
const workspacePressureTimers = new Map<string, NodeJS.Timeout>();
const workspacePressureChecks = new Set<string>();
let cleanupSweepTimer: NodeJS.Timeout | null = null;

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export function armWallTimeout(sessionId: string, ms: number) {
    clearWallTimeout(sessionId);

    const timer = setTimeout(async () => {
        const session = getSession(sessionId);
        if (!session || isTerminalState(session.state)) return;

        pushEvent(sessionId, { type: "error", message: "Execution timed out." });
        await killSession(sessionId, "timed_out");
    }, ms);

    wallTimers.set(sessionId, timer);
}

export function armHardLifetimeTimeout(sessionId: string, ms: number) {
    clearHardLifetimeTimeout(sessionId);

    const timer = setTimeout(async () => {
        const session = getSession(sessionId);
        if (!session || isTerminalState(session.state)) return;

        console.warn("RUNNER session hard-lifetime-killed", {
            sessionId,
            ownerKey: session.ownerKey ?? "anonymous",
            hardLifetimeMs: ms,
        });
        pushEvent(sessionId, {
            type: "error",
            message: "Session reached its maximum lifetime.",
        });
        await killSession(sessionId, "timed_out");
    }, ms);

    hardLifetimeTimers.set(sessionId, timer);
}

export function clearWallTimeout(sessionId: string) {
    const t = wallTimers.get(sessionId);
    if (t) clearTimeout(t);
    wallTimers.delete(sessionId);
}

export function armIdleTimeout(sessionId: string, ms: number) {
    clearIdleTimeout(sessionId);

    const timer = setInterval(async () => {
        const session = getSession(sessionId);
        if (!session) {
            clearIdleTimeout(sessionId);
            return;
        }

        if (isTerminalState(session.state)) {
            clearIdleTimeout(sessionId);
            return;
        }

        const idleFor = Date.now() - session.lastActivityAt;
        if (idleFor >= ms) {
            clearIdleTimeout(sessionId);
            console.warn("RUNNER session idle-killed", {
                sessionId,
                ownerKey: session.ownerKey ?? "anonymous",
                idleTimeoutMs: ms,
                idleFor,
            });
            pushEvent(sessionId, {
                type: "error",
                message: "Session timed out from inactivity.",
            });
            await killSession(sessionId, "timed_out");
        }
    }, 1000);

    idleTimers.set(sessionId, timer);
}

export function clearIdleTimeout(sessionId: string) {
    const t = idleTimers.get(sessionId);
    if (t) clearInterval(t);
    idleTimers.delete(sessionId);
}

export function clearHardLifetimeTimeout(sessionId: string) {
    const t = hardLifetimeTimers.get(sessionId);
    if (t) clearTimeout(t);
    hardLifetimeTimers.delete(sessionId);
}


export function clearWorkspacePressureGuard(sessionId: string) {
    const timer = workspacePressureTimers.get(sessionId);
    if (timer) clearInterval(timer);
    workspacePressureTimers.delete(sessionId);
    workspacePressureChecks.delete(sessionId);
}

export function armWorkspacePressureGuard(
    sessionId: string,
    workspaceDir: string,
) {
    clearWorkspacePressureGuard(sessionId);

    const runCheck = async () => {
        if (workspacePressureChecks.has(sessionId)) return;

        const session = getSession(sessionId);
        if (!session || isTerminalState(session.state)) {
            clearWorkspacePressureGuard(sessionId);
            return;
        }

        workspacePressureChecks.add(sessionId);
        try {
            const usage = await getDirectoryUsage(workspaceDir, {
                maxBytes: env.maxWorkspaceBytes,
                maxEntries: env.maxRuntimeEntries,
            });

            if (usage.bytes > env.maxWorkspaceBytes) {
                console.warn("RUNNER workspace quota-killed", {
                    sessionId,
                    ownerKey: session.ownerKey ?? "anonymous",
                    usedBytes: usage.bytes,
                    maxBytes: env.maxWorkspaceBytes,
                });
                pushEvent(sessionId, {
                    type: "error",
                    message: "Workspace storage limit reached.",
                });
                await killSession(sessionId, "failed");
                return;
            }

            if (usage.entries > env.maxRuntimeEntries) {
                console.warn("RUNNER workspace entry-quota-killed", {
                    sessionId,
                    ownerKey: session.ownerKey ?? "anonymous",
                    entries: usage.entries,
                    maxEntries: env.maxRuntimeEntries,
                });
                pushEvent(sessionId, {
                    type: "error",
                    message: "Workspace file-count limit reached.",
                });
                await killSession(sessionId, "failed");
                return;
            }

            const capacity = await getRunnerFilesystemCapacity(workspaceDir);
            if (
                capacity &&
                capacity.freeBytes < capacity.requiredFreeBytes
            ) {
                console.error("RUNNER host disk-pressure-killed", {
                    sessionId,
                    ownerKey: session.ownerKey ?? "anonymous",
                    freeBytes: capacity.freeBytes,
                    requiredFreeBytes: capacity.requiredFreeBytes,
                    freePercent: Number(capacity.freePercent.toFixed(2)),
                });
                pushEvent(sessionId, {
                    type: "error",
                    message: "Runner storage is temporarily unavailable.",
                });
                await killSession(sessionId, "failed");
            }
        } catch (err) {
            console.error("RUNNER workspace pressure check failed", {
                sessionId,
                message: err instanceof Error ? err.message : String(err),
            });
        } finally {
            workspacePressureChecks.delete(sessionId);
        }
    };

    const timer = setInterval(() => {
        void runCheck();
    }, env.workspacePressureCheckMs);

    if (typeof timer.unref === "function") timer.unref();
    workspacePressureTimers.set(sessionId, timer);

    // Do not wait for the first interval before enforcing a newly-created
    // session's disk budget.
    void runCheck();
}

export function clearAllTimeouts(sessionId: string) {
    clearWallTimeout(sessionId);
    clearIdleTimeout(sessionId);
    clearHardLifetimeTimeout(sessionId);
    clearWorkspacePressureGuard(sessionId);
}

export async function runSessionCleanupSweep(now = Date.now()) {
    for (const session of getAllSessions()) {
        if (isTerminalState(session.state)) {
            if (session.expiresAt && session.expiresAt <= now) {
                await runScheduledWorkspaceCleanupNow(session.id);
            }
            continue;
        }

        const idleTimeoutMs = session.idleTimeoutMs ?? env.ptyIdleTimeoutMs;
        const hardLifetimeMs = session.hardLifetimeMs ?? null;
        const idleFor = now - session.lastActivityAt;
        const lifetimeFor = now - session.createdAt;

        if (hardLifetimeMs && lifetimeFor >= hardLifetimeMs) {
            console.warn("RUNNER session hard-lifetime-killed", {
                sessionId: session.id,
                ownerKey: session.ownerKey ?? "anonymous",
                hardLifetimeMs,
            });
            pushEvent(session.id, {
                type: "error",
                message: "Session reached its maximum lifetime.",
            });
            await killSession(session.id, "timed_out");
            continue;
        }

        if (idleTimeoutMs && idleFor >= idleTimeoutMs) {
            console.warn("RUNNER session idle-killed", {
                sessionId: session.id,
                ownerKey: session.ownerKey ?? "anonymous",
                idleTimeoutMs,
                idleFor,
            });
            pushEvent(session.id, {
                type: "error",
                message: "Session timed out from inactivity.",
            });
            await killSession(session.id, "timed_out");
        }
    }
}

export function startSessionCleanupLoop() {
    if (cleanupSweepTimer) {
        return cleanupSweepTimer;
    }

    cleanupSweepTimer = setInterval(() => {
        void runSessionCleanupSweep().catch((err) => {
            console.error("RUNNER session cleanup sweep failed", {
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }, env.ptyCleanupIntervalMs);

    if (typeof cleanupSweepTimer.unref === "function") {
        cleanupSweepTimer.unref();
    }

    return cleanupSweepTimer;
}
