import type { RunSessionState } from "@zoeskoul/code-contracts";
import { getSession, pushEvent } from "../sessions/sessionStore.js";
import { clearAllTimeouts } from "../sessions/timeoutManager.js";
import { scheduleWorkspaceCleanup } from "../workspace/cleanupWorkspace.js";
import { docker } from "./dockerClient.js";
import { closeSessionSockets } from "../../ws/sessionWsServer.js";

type KillFinalState = Extract<
    RunSessionState,
    "canceled" | "timed_out" | "failed"
>;

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

const sessionTeardowns = new Map<string, Promise<void>>();

/**
 * Finalize a session synchronously, then tear down its Docker container in the
 * background of that state transition.
 *
 * Browser topic handoff waits for the cancel route before opening the next PTY.
 * Docker can take several seconds to acknowledge a kill, so keeping the session
 * active until that acknowledgement unnecessarily holds the user's terminal
 * capacity at its limit. Marking the session terminal first releases capacity
 * immediately while the same promise still lets internal callers await the
 * physical container teardown when they need to.
 */
export function killSession(
    sessionId: string,
    finalState: KillFinalState = "canceled",
) {
    const existingTeardown = sessionTeardowns.get(sessionId);
    if (existingTeardown) return existingTeardown;

    const session = getSession(sessionId);
    if (!session) return Promise.resolve();

    clearAllTimeouts(sessionId);
    closeSessionSockets(sessionId, 1012, `Session ${finalState}`);
    (session.attachStream as { destroy?: () => void } | null | undefined)?.destroy?.();

    if (isTerminalState(session.state)) {
        return Promise.resolve();
    }

    // Release runner capacity before waiting on the Docker daemon.
    pushEvent(sessionId, { type: "status", state: finalState });
    scheduleWorkspaceCleanup(sessionId, session.workspaceDir);

    console.info("RUNNER session cleanup scheduled", {
        sessionId,
        ownerKey: session.ownerKey ?? "anonymous",
        finalState,
    });

    const teardown = (async () => {
        try {
            const container = docker.getContainer(session.containerId);
            await container.kill();
        } catch {
            // The container may already be gone. The session is finalized and its
            // workspace cleanup is still scheduled, so a kill error is non-fatal.
        }
    })().finally(() => {
        sessionTeardowns.delete(sessionId);
    });

    sessionTeardowns.set(sessionId, teardown);
    return teardown;
}
