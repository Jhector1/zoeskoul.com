import fs from "node:fs/promises";
import { env } from "../../lib/env.js";
import {
    deleteSession,
    markSessionFinalized,
} from "../sessions/sessionStore.js";

const cleanupTimers = new Map<string, NodeJS.Timeout>();

export async function cleanupWorkspaceNow(workspaceDir: string) {
    await fs.rm(workspaceDir, {
        recursive: true,
        force: true,
    }).catch(() => {});
}

/**
 * Backward-compatible immediate cleanup.
 * Use scheduleWorkspaceCleanup for completed sessions.
 */
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

export async function runScheduledWorkspaceCleanupNow(sessionId: string) {
    const timer = cleanupTimers.get(sessionId);

    if (timer) {
        clearTimeout(timer);
        cleanupTimers.delete(sessionId);
    }

    // This helper is intentionally test-friendly and deterministic.
    // It uses the session's stored workspaceDir instead of waiting for a timer.
    const { getSession } = await import("../sessions/sessionStore.js");
    const session = getSession(sessionId);

    if (!session) return;

    try {
        await cleanupWorkspaceNow(session.workspaceDir);
    } finally {
        deleteSession(sessionId);
    }
}

export function scheduleWorkspaceCleanup(
    sessionId: string,
    workspaceDir: string,
    ttlMs = env.workspaceTtlMs,
) {
    cancelScheduledWorkspaceCleanup(sessionId);

    const expiresAt = Date.now() + ttlMs;

    markSessionFinalized(sessionId, {
        expiresAt,
    });

    const timer = setTimeout(() => {
        cleanupTimers.delete(sessionId);

        void cleanupWorkspaceNow(workspaceDir).finally(() => {
            deleteSession(sessionId);
        });
    }, ttlMs);

    // Do not unref under tests; fake timers can behave differently with unref'd timers.
    const isTest =
        process.env.NODE_ENV === "test" ||
        process.env.VITEST === "true" ||
        Boolean(process.env.VITEST_WORKER_ID);

    if (!isTest && typeof timer.unref === "function") {
        timer.unref();
    }

    cleanupTimers.set(sessionId, timer);

    return {
        expiresAt,
        ttlMs,
    };
}