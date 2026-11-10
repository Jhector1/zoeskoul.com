import { env } from "../../lib/env.js";
import {
    deleteSession,
    getSession,
    hasOtherSessionsForWorkspaceDir,
    markSessionFinalized,
    type SessionRecord,
} from "../sessions/sessionStore.js";
import { retireSharedShellWorkspaceForCleanup } from "./sharedShellWorkspace.js";
import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";

const cleanupTimers = new Map<string, NodeJS.Timeout>();
// Serializes final-owner removal for shared workspaces. Timer and sweep may
// both fire, but they must never race to reclaim the same directory.
const workspaceCleanupTasks = new Map<string, Promise<void>>();
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;

export async function cleanupWorkspaceNow(workspaceDir: string) {
    // An incomplete deletion must propagate to the caller so previews can
    // quarantine their lease and sessions can retain retryable state.
    await removeRunnerWorkspaceWithRecovery(workspaceDir);
}

/** Backward-compatible immediate cleanup for trusted callers. */
export async function cleanupWorkspace(workspaceDir: string) {
    await cleanupWorkspaceNow(workspaceDir);
}

export function cancelScheduledWorkspaceCleanup(sessionId: string) {
    const timer = cleanupTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        cleanupTimers.delete(sessionId);
    }
}

function deferCleanup(session: SessionRecord, now: number) {
    const failures = Math.min((session.cleanupFailures ?? 0) + 1, 32);
    session.cleanupFailures = failures;
    const delay = Math.min(RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.min(failures - 1, 6));
    session.cleanupRetryAt = Math.max(now, Date.now()) + delay;
}

/**
 * The session is the cleanup tombstone until its last workspace is removed.
 * The existing periodic session sweep retries failures with bounded backoff;
 * on process restart the authoritative startup reaper reconciles both.
 * `now` is injectable for deterministic sweep tests.
 */
export async function runScheduledWorkspaceCleanupNow(
    sessionId: string,
    now = Date.now(),
): Promise<void> {
    cancelScheduledWorkspaceCleanup(sessionId);
    const initial = getSession(sessionId);
    if (!initial) return;
    if ((initial.cleanupRetryAt ?? 0) > now) return;

    // Admin lab root filesystem is discarded with the container. No host path.
    if (initial.labMode === "admin" && initial.workspaceDir === "") {
        deleteSession(sessionId);
        return;
    }
    const workspaceDir = initial.workspaceDir;
    const previous = workspaceCleanupTasks.get(workspaceDir);
    const task = (async () => {
        // A preceding attempt can reject; the next attempt must still run.
        if (previous) await previous.catch(() => undefined);
        const current = getSession(sessionId);
        if (!current || current.workspaceDir !== workspaceDir ||
            (current.cleanupRetryAt ?? 0) > now) return;

        // Closing one of several shared terminal sessions only drops its
        // record. The last owner is responsible for the filesystem.
        if (hasOtherSessionsForWorkspaceDir(workspaceDir, sessionId)) {
            deleteSession(sessionId);
            return;
        }

        // Do not delete a shared workspace while a new terminal is still
        // between acquiring its reservation and registering its session.
        if (!retireSharedShellWorkspaceForCleanup(workspaceDir)) {
            deferCleanup(current, now);
            throw new Error("RUNNER workspace cleanup deferred for active reservation.");
        }

        try {
            await cleanupWorkspaceNow(workspaceDir);
        } catch {
            // Do not expose raw filesystem errors or paths. Keep the session
            // so subsequent sweeps can retry without a Runner restart.
            deferCleanup(current, now);
            throw new Error("RUNNER workspace cleanup deferred for retry.");
        }
        deleteSession(sessionId); // Only after verified successful removal.
    })();

    workspaceCleanupTasks.set(workspaceDir, task);
    try {
        await task;
    } finally {
        if (workspaceCleanupTasks.get(workspaceDir) === task)
            workspaceCleanupTasks.delete(workspaceDir);
    }
}

export function scheduleWorkspaceCleanup(
    sessionId: string,
    workspaceDir: string,
    ttlMs = env.workspaceTtlMs,
) {
    cancelScheduledWorkspaceCleanup(sessionId);
    const expiresAt = Date.now() + ttlMs;
    markSessionFinalized(sessionId, { expiresAt });

    const timer = setTimeout(() => {
        cleanupTimers.delete(sessionId);
        void runScheduledWorkspaceCleanupNow(sessionId).catch(() => {
            // A failed cleanup still has its session tombstone for the sweep.
            console.error("RUNNER scheduled workspace cleanup deferred");
        });
    }, ttlMs);

    // Preserve deterministic fake-timer behavior under tests.
    const isTest = process.env.NODE_ENV === "test" ||
        process.env.VITEST === "true" ||
        Boolean(process.env.VITEST_WORKER_ID);
    if (!isTest && typeof timer.unref === "function") timer.unref();
    cleanupTimers.set(sessionId, timer);
    return { expiresAt, ttlMs };
}
