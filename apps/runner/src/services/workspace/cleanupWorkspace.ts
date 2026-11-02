import { env } from "../../lib/env.js";
import {
    deleteSession,
    getSession,
    hasOtherSessionsForWorkspaceDir,
    markSessionFinalized,
} from "../sessions/sessionStore.js";
import { forgetSharedShellWorkspace } from "./sharedShellWorkspace.js";
import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";

const cleanupTimers = new Map<string, NodeJS.Timeout>();

export async function cleanupWorkspaceNow(workspaceDir: string) {
    // Report an incomplete deletion to the caller so preview admission can
    // quarantine the orphan instead of freeing its shared capacity lease.
    // The rootless reclamation helper repairs only validated Runner workspaces.
    await removeRunnerWorkspaceWithRecovery(workspaceDir);
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
    // A shared IDE workspace is deleted only after its final terminal closes.
    const session = getSession(sessionId);

    if (!session) return;

    const workspaceDir = session.workspaceDir;
    const sharedByAnotherSession = hasOtherSessionsForWorkspaceDir(
        workspaceDir,
        sessionId,
    );

    deleteSession(sessionId);

    if (!sharedByAnotherSession) {
        forgetSharedShellWorkspace(workspaceDir);
        await cleanupWorkspaceNow(workspaceDir);
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

        const sharedByAnotherSession = hasOtherSessionsForWorkspaceDir(
            workspaceDir,
            sessionId,
        );
        deleteSession(sessionId);

        if (!sharedByAnotherSession) {
            forgetSharedShellWorkspace(workspaceDir);
            void cleanupWorkspaceNow(workspaceDir).catch(() => {
                // The startup reaper retries on its next admission sweep.
                // Never log raw filesystem errors or private workspace paths.
                console.error("RUNNER scheduled workspace cleanup deferred");
            });
        }
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
